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

#pragma mark - Settings Menu Entry (UIKit)

static UIView *vencordSettingsPanel = nil;

@interface VencordHandler : NSObject
+ (instancetype)shared;
- (void)showSettingsPanel;
- (void)hideSettingsPanel;
- (void)closeTapped;
- (void)toggleChanged:(UISwitch *)sender;
- (void)vencordButtonTapped;
- (void)vencordButtonPanned:(UIPanGestureRecognizer *)pan;
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

- (void)vencordButtonTapped {
    if (vencordSettingsPanel && !vencordSettingsPanel.hidden) {
        [self hideSettingsPanel];
    } else {
        [self showSettingsPanel];
    }
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

- (void)vencordButtonPanned:(UIPanGestureRecognizer *)pan {
    CGPoint translation = [pan translationInView:pan.view];
    pan.view.center = CGPointMake(pan.view.center.x + translation.x, pan.view.center.y + translation.y);
    [pan setTranslation:CGPointZero inView:pan.view];
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
    [closeBtn addTarget:[VencordHandler shared] action:@selector(closeTapped) forControlEvents:UIControlEventTouchUpInside];
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
        [toggle addTarget:[VencordHandler shared] action:@selector(toggleChanged:) forControlEvents:UIControlEventValueChanged];

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

    UIWindow *keyWindow = nil;
    for (UIWindow *win in [UIApplication sharedApplication].windows) {
        if (win.isKeyWindow) { keyWindow = win; break; }
    }
    if (!keyWindow) keyWindow = [UIApplication sharedApplication].windows.firstObject;

    panel.alpha = 0;
    [keyWindow addSubview:panel];
    [UIView animateWithDuration:0.25 animations:^{ panel.alpha = 1; }];

    vencordSettingsPanel = panel;
}

@end

#pragma mark - Settings Screen Injection via viewDidAppear: swizzle

static void (*origViewDidAppear)(id, SEL, BOOL);
static NSMutableSet *injectedVCs = nil;
static UIView *vencordOverlayButton = nil;

BOOL hasVencordLabel(UIView *view, int depth) {
    if (depth > 6) return NO;
    if ([view isKindOfClass:[UILabel class]]) {
        UILabel *label = (UILabel *)view;
        if (label.text && (
            [label.text isEqualToString:@"User Settings"] ||
            [label.text isEqualToString:@"Settings"] ||
            [label.text isEqualToString:@"My Account"])) {
            return YES;
        }
    }
    for (UIView *sub in view.subviews) {
        if (hasVencordLabel(sub, depth + 1)) return YES;
    }
    return NO;
}

BOOL hasScrollViewChild(UIView *view, int depth) {
    if (depth > 4) return NO;
    if ([view isKindOfClass:[UIScrollView class]]) return YES;
    for (UIView *sub in view.subviews) {
        if (hasScrollViewChild(sub, depth + 1)) return YES;
    }
    return NO;
}

void createVencordOverlayButton(void) {
    if (vencordOverlayButton) return;

    CGFloat btnSize = 44;
    CGFloat screenW = [UIScreen mainScreen].bounds.size.width;
    CGFloat screenH = [UIScreen mainScreen].bounds.size.height;

    UIView *btn = [[UIView alloc] initWithFrame:CGRectMake(screenW - 56, screenH * 0.45, btnSize, btnSize)];
    btn.backgroundColor = [UIColor colorWithRed:0.345 green:0.396 blue:0.949 alpha:1.0];
    btn.layer.cornerRadius = btnSize / 2;
    btn.clipsToBounds = YES;
    btn.layer.shadowColor = [UIColor colorWithRed:0.345 green:0.396 blue:0.949 alpha:1.0].CGColor;
    btn.layer.shadowOpacity = 0.6;
    btn.layer.shadowOffset = CGSizeMake(0, 2);
    btn.layer.shadowRadius = 8;

    UILabel *vLabel = [[UILabel alloc] initWithFrame:btn.bounds];
    vLabel.text = @"V";
    vLabel.textColor = [UIColor whiteColor];
    vLabel.font = [UIFont boldSystemFontOfSize:18];
    vLabel.textAlignment = NSTextAlignmentCenter;
    [btn addSubview:vLabel];

    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:[VencordHandler shared] action:@selector(vencordButtonTapped)];
    [btn addGestureRecognizer:tap];

    UIPanGestureRecognizer *pan = [[UIPanGestureRecognizer alloc] initWithTarget:[VencordHandler shared] action:@selector(vencordButtonPanned:)];
    [btn addGestureRecognizer:pan];

    UIWindow *keyWindow = nil;
    for (UIWindow *w in [UIApplication sharedApplication].windows) {
        if (w.isKeyWindow) { keyWindow = w; break; }
    }
    if (!keyWindow) keyWindow = [UIApplication sharedApplication].windows.firstObject;
    [keyWindow addSubview:btn];

    vencordOverlayButton = btn;
}

void swizzledViewDidAppear(id self, SEL _cmd, BOOL animated) {
    origViewDidAppear(self, _cmd, animated);

    if (![self isKindOfClass:[UIViewController class]]) return;
    UIViewController *vc = (UIViewController *)self;
    if ([vc isKindOfClass:[UINavigationController class]]) return;
    if ([vc isKindOfClass:[UITabBarController class]]) return;

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (!injectedVCs) injectedVCs = [NSMutableSet set];
        NSString *addr = [NSString stringWithFormat:@"%p", vc];
        if ([injectedVCs containsObject:addr]) return;

        if (hasVencordLabel(vc.view, 0)) {
            [injectedVCs addObject:addr];
            vencordLog(@"Settings screen detected: %@", NSStringFromClass([vc class]));
            createVencordOverlayButton();
            vencordOverlayButton.hidden = NO;
            vencordOverlayButton.alpha = 0;
            [UIView animateWithDuration:0.3 animations:^{ vencordOverlayButton.alpha = 1; }];
            flushLog();
        } else {
            if (vencordOverlayButton && !vencordOverlayButton.hidden) {
                vencordOverlayButton.hidden = YES;
            }
        }
    });
}

void setupSettingsInjector(void) {
    if (!injectedVCs) injectedVCs = [NSMutableSet set];
    Class vcClass = [UIViewController class];
    SEL sel = @selector(viewDidAppear:);
    Method method = class_getInstanceMethod(vcClass, sel);
    if (method) {
        origViewDidAppear = (void (*)(id, SEL, BOOL))method_getImplementation(method);
        method_setImplementation(method, (IMP)swizzledViewDidAppear);
        vencordLog(@"Swizzled UIViewController viewDidAppear:");
    }
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
            vencordLog(@"Settings injector setup complete");
            flushLog();
        });

        vencordLog(@"Constructor complete");
        flushLog();
    }
}
