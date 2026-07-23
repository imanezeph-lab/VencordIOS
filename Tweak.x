#import <UIKit/UIKit.h>
#import <JavaScriptCore/JavaScriptCore.h>
#import <Foundation/Foundation.h>
#import <objc/runtime.h>

static BOOL vencordInitialized = NO;
static JSContext *globalJSContext = nil;
static NSMutableString *logBuffer = nil;
static NSString *logFilePath = nil;

#pragma mark - File Logging

void vencordLog(NSString *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    NSString *msg = [[NSString alloc] initWithFormat:fmt arguments:args];
    va_end(args);
    NSString *line = [NSString stringWithFormat:@"%@\n", msg];
    NSLog(@"[VencordIOS] %@", msg);
    if (!logBuffer) logBuffer = [NSMutableString string];
    [logBuffer appendString:line];
    if (logFilePath) {
        NSData *data = [logBuffer dataUsingEncoding:NSUTF8StringEncoding];
        [data writeToFile:logFilePath atomically:YES];
    }
}

void flushLog(void) {
    if (logFilePath && logBuffer) {
        NSData *data = [logBuffer dataUsingEncoding:NSUTF8StringEncoding];
        [data writeToFile:logFilePath atomically:YES];
    }
}

#pragma mark - Plugin State Management

static NSMutableDictionary<NSString *, NSNumber *> *pluginStates = nil;
static NSString *pluginStatesPath = nil;

void savePluginStates(void) {
    if (!pluginStatesPath || !pluginStates) return;
    @try {
        NSData *data = [NSPropertyListSerialization dataWithPropertyList:pluginStates
                                                                  format:NSPropertyListBinaryFormat_v1_0
                                                                 options:0
                                                                   error:nil];
        [data writeToFile:pluginStatesPath atomically:YES];
    } @catch (NSException *e) {}
}

void loadPluginStates(void) {
    @try {
        NSString *documentsPath = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
        NSString *vencordPath = [documentsPath stringByAppendingPathComponent:@"VencordIOS"];
        pluginStatesPath = [vencordPath stringByAppendingPathComponent:@"PluginStates.plist"];
        logFilePath = [vencordPath stringByAppendingPathComponent:@"vencord.log"];
        [[NSFileManager defaultManager] createDirectoryAtPath:vencordPath
                                  withIntermediateDirectories:YES
                                                   attributes:nil
                                                        error:nil];
        if ([[NSFileManager defaultManager] fileExistsAtPath:pluginStatesPath]) {
            pluginStates = [NSMutableDictionary dictionaryWithContentsOfFile:pluginStatesPath];
        } else {
            pluginStates = [NSMutableDictionary dictionary];
        }
    } @catch (NSException *e) {
        pluginStates = [NSMutableDictionary dictionary];
    }
}

BOOL isPluginEnabled(NSString *pluginId) {
    if (!pluginStates) loadPluginStates();
    NSNumber *state = pluginStates[pluginId];
    return state ? [state boolValue] : YES;
}

#pragma mark - JS File Loader

NSString *loadJSFile(NSString *name) {
    @try {
        NSString *bundlePath = [[NSBundle mainBundle] bundlePath];
        NSString *pluginsDir = [bundlePath stringByAppendingPathComponent:@"VencordJS/plugins"];
        NSString *path = [pluginsDir stringByAppendingPathComponent:[name stringByAppendingString:@".js"]];
        NSError *error = nil;
        NSString *code = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&error];
        if (error) {
            vencordLog(@"Failed to load %@: %@", name, error.localizedDescription);
            return nil;
        }
        return code;
    } @catch (NSException *e) {
        vencordLog(@"Exception loading %@: %@", name, e);
        return nil;
    }
}

void evalJSFile(JSContext *context, NSString *name) {
    NSString *code = loadJSFile(name);
    if (code) {
        @try {
            [context evaluateScript:code];
            vencordLog(@"Loaded %@", name);
        } @catch (NSException *e) {
            vencordLog(@"Error evaluating %@: %@", name, e);
        }
    }
}

#pragma mark - JavaScript Injection

void injectVencordJS(JSContext *context) {
    if (!context || vencordInitialized) return;
    @try {
        vencordLog(@"Starting JS injection...");
        evalJSFile(context, @"vencordCore");

        NSArray *pluginNames = @[
            @"noTrack", @"silentTyping", @"messageLogger", @"betterEmbeds",
            @"noReplyTimeout", @"showHiddenServers", @"blurNSFW", @"betterStatus",
            @"emojiUtilities", @"multiAccount", @"voiceOptimizer", @"unlimitedServers"
        ];
        for (NSString *name in pluginNames) {
            if (isPluginEnabled(name)) {
                evalJSFile(context, name);
            }
        }

        evalJSFile(context, @"vencordAllPlugins");
        evalJSFile(context, @"vcSettingsUI");

        @try {
            [context evaluateScript:@"if(window.Vencord){Vencord.applyPatches();}"];
            vencordLog(@"applyPatches called");
        } @catch (NSException *e) {
            vencordLog(@"applyPatches error: %@", e);
        }

        vencordInitialized = YES;
        vencordLog(@"All plugins loaded and patches applied");
        flushLog();
    } @catch (NSException *exception) {
        vencordLog(@"JS Injection error: %@", exception);
        flushLog();
    }
}

#pragma mark - Swizzle RCTBridge to capture JSContext

static JSContext *capturedContext = nil;
typedef JSContext *(*jsContextFunc)(id self, SEL _cmd);
static jsContextFunc originalJsContext = NULL;

JSContext *swizzledJsContext(id self, SEL _cmd) {
    vencordLog(@"swizzledJsContext called");
    JSContext *ctx = originalJsContext(self, _cmd);
    if (ctx) {
        capturedContext = ctx;
        globalJSContext = ctx;
        vencordLog(@"Captured JSContext from RCTBridge");
        flushLog();
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            if (!vencordInitialized && globalJSContext) {
                loadPluginStates();
                injectVencordJS(globalJSContext);
            }
        });
    }
    return ctx;
}

void setupHooks(void) {
    @try {
        vencordLog(@"Setting up hooks...");
        Class rctBridgeClass = objc_getClass("RCTBridge");
        vencordLog(@"RCTBridge class: %@", rctBridgeClass ? @"found" : @"NOT FOUND");
        if (rctBridgeClass) {
            SEL sel = sel_registerName("jsContext");
            Method method = class_getInstanceMethod(rctBridgeClass, sel);
            vencordLog(@"jsContext method: %@", method ? @"found" : @"NOT FOUND");
            if (method) {
                originalJsContext = (jsContextFunc)method_getImplementation(method);
                method_setImplementation(method, (IMP)swizzledJsContext);
                vencordLog(@"Hooked RCTBridge.jsContext via swizzling");
            }
        }

        [[NSNotificationCenter defaultCenter] addObserverForName:@"RCTContentDidAppearNotification"
                                                            object:nil
                                                             queue:[NSOperationQueue mainQueue]
                                                        usingBlock:^(NSNotification *note) {
            vencordLog(@"RCTContentDidAppearNotification received");
            flushLog();
            if (!vencordInitialized) {
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                    if (!vencordInitialized && globalJSContext) {
                        loadPluginStates();
                        injectVencordJS(globalJSContext);
                    }
                });
            }
        }];
        vencordLog(@"Notification observer registered");

        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(10.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            vencordLog(@"Fallback check: vencordInitialized=%d, globalJSContext=%@",
                       vencordInitialized, globalJSContext ? @"set" : @"nil");
            flushLog();
        });

        vencordLog(@"Hooks setup complete");
        flushLog();
    } @catch (NSException *e) {
        vencordLog(@"Hook setup error: %@", e);
        flushLog();
    }
}

#pragma mark - Settings Panel

static UIView *vencordSettingsPanel = nil;
static UIView *vencordOverlayWindow = nil;

@interface VencordHandler : NSObject
+ (instancetype)shared;
- (void)showSettingsPanel;
- (void)hideSettingsPanel;
- (void)closeTapped;
- (void)toggleChanged:(UISwitch *)sender;
@end

@implementation VencordHandler

+ (instancetype)shared {
    static VencordHandler *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[VencordHandler alloc] init];
    });
    return instance;
}

- (void)closeTapped {
    [self hideSettingsPanel];
}

- (void)hideSettingsPanel {
    if (vencordSettingsPanel) {
        [UIView animateWithDuration:0.25 animations:^{
            vencordSettingsPanel.alpha = 0;
        } completion:^(BOOL finished) {
            vencordSettingsPanel.hidden = YES;
            vencordSettingsPanel.alpha = 1;
        }];
    }
}

- (void)toggleChanged:(UISwitch *)sender {
    NSArray *pluginIds = @[
        @"noTrack", @"silentTyping", @"messageLogger", @"betterEmbeds",
        @"noReplyTimeout", @"showHiddenServers", @"blurNSFW", @"betterStatus",
        @"emojiUtilities", @"multiAccount", @"voiceOptimizer", @"unlimitedServers"
    ];
    int idx = (int)sender.tag;
    if (idx < 0 || idx >= (int)pluginIds.count) return;
    NSString *pluginId = pluginIds[idx];
    pluginStates[pluginId] = @(sender.isOn);
    savePluginStates();
    vencordLog(@"Plugin %@ %@", pluginId, sender.isOn ? @"enabled" : @"disabled");
    flushLog();
}

- (void)showSettingsPanel {
    if (vencordSettingsPanel && !vencordSettingsPanel.hidden) {
        [self hideSettingsPanel];
        return;
    }

    NSArray *pluginIds = @[
        @"noTrack", @"silentTyping", @"messageLogger", @"betterEmbeds",
        @"noReplyTimeout", @"showHiddenServers", @"blurNSFW", @"betterStatus",
        @"emojiUtilities", @"multiAccount", @"voiceOptimizer", @"unlimitedServers"
    ];
    NSArray *pluginNames = @[
        @"No Track", @"Silent Typing", @"Message Logger", @"Better Embeds",
        @"No Reply Timeout", @"Hidden Servers", @"Blur NSFW", @"Better Status",
        @"Emoji Utilities", @"Account Switcher", @"Voice Optimizer", @"Unlimited Servers"
    ];
    NSArray *pluginDescs = @[
        @"Disables Discord analytics/tracking",
        @"Hides typing indicator from others",
        @"Logs deleted/edited messages",
        @"Improved link embeds",
        @"Removes reply timeout limit",
        @"Shows hidden servers in list",
        @"Blurs NSFW content in chat",
        @"Custom status controls",
        @"Extra emoji features",
        @"Switch between accounts",
        @"Optimizes voice chat settings",
        @"Shows all servers in sidebar"
    ];

    CGRect screenBounds = [UIScreen mainScreen].bounds;
    CGFloat pw = MIN(360, screenBounds.size.width - 24);
    CGFloat ph = screenBounds.size.height * 0.65;
    CGFloat px = (screenBounds.size.width - pw) / 2;
    CGFloat py = (screenBounds.size.height - ph) / 2;

    UIView *panel = [[UIView alloc] initWithFrame:CGRectMake(px, py, pw, ph)];
    panel.backgroundColor = [UIColor colorWithRed:0.11 green:0.12 blue:0.13 alpha:0.97];
    panel.layer.cornerRadius = 16;
    panel.layer.shadowColor = [UIColor blackColor].CGColor;
    panel.layer.shadowOpacity = 0.6;
    panel.layer.shadowOffset = CGSizeMake(0, 8);
    panel.layer.shadowRadius = 30;
    panel.clipsToBounds = YES;

    UIView *header = [[UIView alloc] initWithFrame:CGRectMake(0, 0, pw, 56)];
    header.backgroundColor = [UIColor colorWithRed:0.13 green:0.14 blue:0.17 alpha:1.0];
    [panel addSubview:header];

    UILabel *titleLabel = [[UILabel alloc] initWithFrame:CGRectMake(20, 12, pw - 60, 32)];
    titleLabel.text = @"Vencord iOS";
    titleLabel.textColor = [UIColor whiteColor];
    titleLabel.font = [UIFont boldSystemFontOfSize:20];
    [header addSubview:titleLabel];

    UILabel *subtitleLabel = [[UILabel alloc] initWithFrame:CGRectMake(20, 36, pw - 60, 16)];
    subtitleLabel.text = [NSString stringWithFormat:@"%lu plugins loaded", (unsigned long)pluginIds.count];
    subtitleLabel.textColor = [UIColor grayColor];
    subtitleLabel.font = [UIFont systemFontOfSize:11];
    [header addSubview:subtitleLabel];

    UIButton *closeBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    closeBtn.frame = CGRectMake(pw - 44, 12, 32, 32);
    [closeBtn setTitle:@"\u2715" forState:UIControlStateNormal];
    [closeBtn setTitleColor:[UIColor grayColor] forState:UIControlStateNormal];
    closeBtn.titleLabel.font = [UIFont systemFontOfSize:18];
    [closeBtn addTarget:self action:@selector(closeTapped) forControlEvents:UIControlEventTouchUpInside];
    [header addSubview:closeBtn];

    UIScrollView *scrollView = [[UIScrollView alloc] initWithFrame:CGRectMake(0, 56, pw, ph - 56)];
    scrollView.showsVerticalScrollIndicator = YES;

    CGFloat yPos = 8;
    for (int i = 0; i < (int)pluginIds.count; i++) {
        UIView *row = [[UIView alloc] initWithFrame:CGRectMake(12, yPos, pw - 24, 60)];

        UISwitch *toggle = [[UISwitch alloc] initWithFrame:CGRectMake(pw - 78, 12, 51, 31)];
        toggle.on = isPluginEnabled(pluginIds[i]);
        toggle.tag = i;
        toggle.onTintColor = [UIColor colorWithRed:0.345 green:0.396 blue:0.949 alpha:1.0];
        toggle.transform = CGAffineTransformMakeScale(0.85, 0.85);
        [toggle addTarget:self action:@selector(toggleChanged:) forControlEvents:UIControlEventValueChanged];

        UILabel *nameLabel = [[UILabel alloc] initWithFrame:CGRectMake(8, 6, pw - 100, 22)];
        nameLabel.text = pluginNames[i];
        nameLabel.textColor = [UIColor whiteColor];
        nameLabel.font = [UIFont systemFontOfSize:15 weight:UIFontWeightMedium];

        UILabel *descLabel = [[UILabel alloc] initWithFrame:CGRectMake(8, 30, pw - 100, 22)];
        descLabel.text = pluginDescs[i];
        descLabel.textColor = [UIColor colorWithWhite:0.55 alpha:1.0];
        descLabel.font = [UIFont systemFontOfSize:11];

        UIView *separator = [[UIView alloc] initWithFrame:CGRectMake(8, 58, pw - 32, 0.5)];
        separator.backgroundColor = [UIColor colorWithWhite:0.25 alpha:0.6];

        [row addSubview:nameLabel];
        [row addSubview:descLabel];
        [row addSubview:toggle];
        [row addSubview:separator];
        [scrollView addSubview:row];

        yPos += 62;
    }
    scrollView.contentSize = CGSizeMake(pw, yPos + 16);
    [panel addSubview:scrollView];

    UIWindow *targetWindow = nil;
    for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) {
        if ([scene isKindOfClass:[UIWindowScene class]]) {
            UIWindowScene *wScene = (UIWindowScene *)scene;
            for (UIWindow *w in wScene.windows) {
                if (w.isKeyWindow) { targetWindow = w; break; }
            }
            if (!targetWindow && wScene.windows.count > 0) {
                targetWindow = wScene.windows.firstObject;
            }
        }
        if (targetWindow) break;
    }
    if (!targetWindow) {
        for (UIWindow *w in [UIApplication sharedApplication].windows) {
            if (w.isKeyWindow) { targetWindow = w; break; }
        }
    }

    panel.alpha = 0;
    if (targetWindow) {
        [targetWindow addSubview:panel];
    }
    [UIView animateWithDuration:0.25 animations:^{ panel.alpha = 1; }];

    vencordSettingsPanel = panel;
}

@end

#pragma mark - Settings Row Injection

static NSMutableSet *injectedScrollViews = nil;

UIView *findLargestScrollView(UIView *view, int depth) {
    if (depth > 12) return nil;
    UIScrollView *bestCandidate = nil;

    if ([view isKindOfClass:[UIScrollView class]]) {
        UIScrollView *sv = (UIScrollView *)view;
        if (sv.contentSize.height > 300 && sv.bounds.size.height > 200) {
            bestCandidate = sv;
        }
    }

    for (UIView *sub in view.subviews) {
        UIView *found = findLargestScrollView(sub, depth + 1);
        if (found) {
            UIScrollView *foundSV = (UIScrollView *)found;
            if (!bestCandidate || foundSV.contentSize.height > bestCandidate.contentSize.height) {
                bestCandidate = foundSV;
            }
        }
    }
    return bestCandidate;
}

@interface VencordRowView : UIView
@property (nonatomic, strong) UIView *highlightBg;
@property (nonatomic, assign) BOOL highlightOn;
@end

@implementation VencordRowView

- (void)touchesBegan:(NSSet *)touches withEvent:(UIEvent *)event {
    self.highlightOn = YES;
    self.highlightBg.hidden = NO;
}

- (void)touchesMoved:(NSSet *)touches withEvent:(UIEvent *)event {
    UITouch *touch = [touches anyObject];
    CGPoint loc = [touch locationInView:self];
    BOOL inside = CGRectContainsPoint(self.bounds, loc);
    self.highlightBg.hidden = !inside;
    self.highlightOn = inside;
}

- (void)touchesEnded:(NSSet *)touches withEvent:(UIEvent *)event {
    self.highlightBg.hidden = YES;
    self.highlightOn = NO;
    if (self.onTap) self.onTap();
}

- (void)touchesCancelled:(NSSet *)touches withEvent:(UIEvent *)event {
    self.highlightBg.hidden = YES;
    self.highlightOn = NO;
}

@property (nonatomic, copy) void (^onTap)(void);

@end

void injectVencordRow(UIScrollView *scrollView) {
    if (!injectedScrollViews) injectedScrollViews = [NSMutableSet set];
    NSString *addr = [NSString stringWithFormat:@"%p", scrollView];

    for (UIView *sub in scrollView.subviews) {
        if (sub.tag == 7777) {
            [injectedScrollViews addObject:addr];
            return;
        }
    }

    CGFloat rowWidth = scrollView.bounds.size.width;
    CGFloat rowHeight = 60;
    CGFloat topInset = 0;
    CGFloat minRowY = 120;

    UIView *contentView = scrollView;
    for (UIView *sub in scrollView.subviews) {
        NSString *className = NSStringFromClass([sub class]);
        if ([className containsString:@"Content"] || [className containsString:@"content"]) {
            contentView = sub;
            break;
        }
    }

    CGFloat maxY = 0;
    int skipCount = 0;
    for (UIView *sub in contentView.subviews) {
        CGFloat bottom = sub.frame.origin.y + sub.frame.size.height;
        if (bottom > maxY) maxY = bottom;
        if (sub.frame.origin.y < minRowY && sub.frame.size.height < 80 && sub.frame.size.height > 10) {
            skipCount++;
        }
    }
    topInset = maxY;

    UIView *row = [[VencordRowView alloc] initWithFrame:CGRectMake(0, topInset, rowWidth, rowHeight)];
    row.tag = 7777;

    UIView *highlightBg = [[UIView alloc] initWithFrame:row.bounds];
    highlightBg.backgroundColor = [UIColor colorWithWhite:0.25 alpha:1.0];
    highlightBg.hidden = YES;
    highlightBg.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [row addSubview:highlightBg];
    row.highlightBg = highlightBg;

    UIView *iconBg = [[UIView alloc] initWithFrame:CGRectMake(16, 10, 40, 40)];
    iconBg.backgroundColor = [UIColor colorWithRed:0.345 green:0.396 blue:0.949 alpha:1.0];
    iconBg.layer.cornerRadius = 8;
    UILabel *iconLabel = [[UILabel alloc] initWithFrame:iconBg.bounds];
    iconLabel.text = @"V";
    iconLabel.textColor = [UIColor whiteColor];
    iconLabel.font = [UIFont boldSystemFontOfSize:18];
    iconLabel.textAlignment = NSTextAlignmentCenter;
    [iconBg addSubview:iconLabel];
    [row addSubview:iconBg];

    UILabel *titleLabel = [[UILabel alloc] initWithFrame:CGRectMake(68, 10, 200, 24)];
    titleLabel.text = @"Vencord";
    titleLabel.textColor = [UIColor whiteColor];
    titleLabel.font = [UIFont systemFontOfSize:17 weight:UIFontWeightMedium];
    [row addSubview:titleLabel];

    UILabel *descLabel = [[UILabel alloc] initWithFrame:CGRectMake(68, 34, 200, 18)];
    descLabel.text = @"Plugins & tweaks";
    descLabel.textColor = [UIColor grayColor];
    descLabel.font = [UIFont systemFontOfSize:12];
    [row addSubview:descLabel];

    UIImageView *chevron = [[UIImageView alloc] initWithFrame:CGRectMake(rowWidth - 34, 18, 10, 24)];
    chevron.image = [UIImage systemImageNamed:@"chevron.right"];
    chevron.tintColor = [UIColor colorWithWhite:0.4 alpha:1.0];
    chevron.contentMode = UIViewContentModeScaleAspectFit;
    [row addSubview:chevron];

    UIView *separator = [[UIView alloc] initWithFrame:CGRectMake(68, rowHeight - 0.5, rowWidth - 68, 0.5)];
    separator.backgroundColor = [UIColor colorWithWhite:0.3 alpha:0.5];
    [row addSubview:separator];

    row.onTap = ^{
        vencordLog(@"Vencord row tapped");
        [[VencordHandler shared] showSettingsPanel];
    };

    [contentView addSubview:row];

    CGSize size = scrollView.contentSize;
    scrollView.contentSize = CGSizeMake(size.width, MAX(size.height, topInset + rowHeight + 20));

    [injectedScrollViews addObject:addr];
    vencordLog(@"Vencord row injected at y=%.0f in scroll view (%p), contentSize: %.0f", topInset, scrollView, scrollView.contentSize.height);
    flushLog();
}

#pragma mark - Settings Screen Detection

static void (*origViewDidAppear)(id, SEL, BOOL);

void swizzledViewDidAppear(id self, SEL _cmd, BOOL animated) {
    origViewDidAppear(self, _cmd, animated);

    if (![self isKindOfClass:[UIViewController class]]) return;
    UIViewController *vc = (UIViewController *)self;
    if ([vc isKindOfClass:[UINavigationController class]]) return;
    if ([vc isKindOfClass:[UITabBarController class]]) return;

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (!vc.view) return;
        UIView *scrollView = findLargestScrollView(vc.view, 0);
        if (scrollView) {
            vencordLog(@"Found scroll view in %@ (%p, contentH=%.0f)", NSStringFromClass([vc class]), scrollView, [(UIScrollView *)scrollView contentSize].height);
            injectVencordRow((UIScrollView *)scrollView);
        }
    });
}

void setupSettingsInjector(void) {
    if (!injectedScrollViews) injectedScrollViews = [NSMutableSet set];

    Class vcClass = [UIViewController class];
    SEL sel = @selector(viewDidAppear:);
    Method method = class_getInstanceMethod(vcClass, sel);
    if (method) {
        origViewDidAppear = (void (*)(id, SEL, BOOL))method_getImplementation(method);
        method_setImplementation(method, (IMP)swizzledViewDidAppear);
        vencordLog(@"Swizzled UIViewController viewDidAppear:");
    }

    dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
    dispatch_source_set_timer(timer, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC), 3 * NSEC_PER_SEC, 1 * NSEC_PER_SEC);
    dispatch_source_set_event_handler(timer, ^{
        for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) {
            if (![scene isKindOfClass:[UIWindowScene class]]) continue;
            UIWindowScene *wScene = (UIWindowScene *)scene;
            for (UIWindow *window in wScene.windows) {
                UIViewController *topVC = window.rootViewController;
                while (topVC.presentedViewController) {
                    topVC = topVC.presentedViewController;
                }
                if ([topVC isKindOfClass:[UINavigationController class]]) {
                    topVC = [(UINavigationController *)topVC topViewController];
                }
                if (!topVC || !topVC.view) continue;

                UIView *scrollView = findLargestScrollView(topVC.view, 0);
                if (scrollView) {
                    BOOL hasRow = NO;
                    for (UIView *sub in ((UIScrollView *)scrollView).subviews) {
                        if (sub.tag == 7777) { hasRow = YES; break; }
                    }
                    if (!hasRow) {
                        injectVencordRow((UIScrollView *)scrollView);
                    }
                }
            }
        }
    });
    dispatch_resume(timer);

    flushLog();
}

#pragma mark - Constructor

__attribute__((constructor))
static void vencordInit(void) {
    @autoreleasepool {
        NSString *documentsPath = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
        NSString *vencordPath = [documentsPath stringByAppendingPathComponent:@"VencordIOS"];
        [[NSFileManager defaultManager] createDirectoryAtPath:vencordPath
                                  withIntermediateDirectories:YES
                                                   attributes:nil
                                                        error:nil];
        logFilePath = [vencordPath stringByAppendingPathComponent:@"vencord.log"];
        [@"" writeToFile:logFilePath atomically:YES encoding:NSUTF8StringEncoding error:nil];
        logBuffer = [NSMutableString string];

        vencordLog(@"=== Vencord for iOS v1.0.0 ===");
        vencordLog(@"Dylib loaded via constructor");

        loadPluginStates();
        setupHooks();

        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(5.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            setupSettingsInjector();
            vencordLog(@"Settings injector active");
            flushLog();
        });

        vencordLog(@"Constructor complete");
        flushLog();
    }
}
