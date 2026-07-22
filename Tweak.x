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

        // Try to hook RCTBridge jsContext using runtime swizzling
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

        // Also listen for React Native content appearing
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

        // Fallback: try to find JSContext after a delay
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

#pragma mark - Native Settings UI

static UIView *vencordOverlayButton = nil;
static UIView *vencordSettingsPanel = nil;

@interface VencordPluginEntry : NSObject
@property (nonatomic, copy) NSString *pluginId;
@property (nonatomic, copy) NSString *pluginName;
@property (nonatomic, copy) NSString *pluginDesc;
@property (nonatomic, assign) BOOL enabled;
@end

@implementation VencordPluginEntry
@end

static NSArray<VencordPluginEntry *> *pluginEntries = nil;

@interface VencordHandler : NSObject
+ (instancetype)shared;
- (void)buttonTapped;
- (void)closeTapped;
- (void)toggleChanged:(UISwitch *)sender;
- (void)buttonPanned:(UIPanGestureRecognizer *)pan;
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

- (void)buttonTapped {
    if (vencordSettingsPanel && !vencordSettingsPanel.hidden) {
        vencordSettingsPanel.hidden = YES;
    } else {
        [self showSettingsPanel];
    }
}

- (void)closeTapped {
    vencordSettingsPanel.hidden = YES;
}

- (void)toggleChanged:(UISwitch *)sender {
    int index = (int)sender.tag;
    if (index < 0 || index >= (int)pluginEntries.count) return;
    VencordPluginEntry *entry = pluginEntries[index];
    entry.enabled = sender.isOn;
    pluginStates[entry.pluginId] = @(sender.isOn);
    savePluginStates();
    vencordLog(@"Plugin %@ %@", entry.pluginId, sender.isOn ? @"enabled" : @"disabled");
    flushLog();
}

- (void)buttonPanned:(UIPanGestureRecognizer *)pan {
    CGPoint translation = [pan translationInView:pan.view];
    pan.view.center = CGPointMake(pan.view.center.x + translation.x, pan.view.center.y + translation.y);
    [pan setTranslation:CGPointZero inView:pan.view];
}

- (void)showSettingsPanel {
    if (vencordSettingsPanel) {
        vencordSettingsPanel.hidden = NO;
        return;
    }

    NSMutableArray<VencordPluginEntry *> *entries = [NSMutableArray array];
    struct { NSString *pid; NSString *pname; NSString *pdesc; } plugins[] = {
        { @"noTrack", @"No Track", @"Disables Discord analytics/tracking" },
        { @"silentTyping", @"Silent Typing", @"Hides typing indicator from others" },
        { @"messageLogger", @"Message Logger", @"Logs deleted/edited messages" },
        { @"betterEmbeds", @"Better Embeds", @"Improved link embeds" },
        { @"noReplyTimeout", @"No Reply Timeout", @"Removes reply timeout limit" },
        { @"showHiddenServers", @"Hidden Servers", @"Shows hidden servers in list" },
        { @"blurNSFW", @"Blur NSFW", @"Blurs NSFW content in chat" },
        { @"betterStatus", @"Better Status", @"Custom status controls" },
        { @"emojiUtilities", @"Emoji Utilities", @"Extra emoji features" },
        { @"multiAccount", @"Account Switcher", @"Switch between accounts" },
        { @"voiceOptimizer", @"Voice Optimizer", @"Optimizes voice chat settings" },
        { @"unlimitedServers", @"Unlimited Servers", @"Shows all servers in sidebar" },
    };
    for (int i = 0; i < sizeof(plugins)/sizeof(plugins[0]); i++) {
        VencordPluginEntry *entry = [[VencordPluginEntry alloc] init];
        entry.pluginId = plugins[i].pid;
        entry.pluginName = plugins[i].pname;
        entry.pluginDesc = plugins[i].pdesc;
        entry.enabled = isPluginEnabled(plugins[i].pid);
        [entries addObject:entry];
    }
    pluginEntries = entries;

    CGRect screenBounds = [UIScreen mainScreen].bounds;
    CGFloat w = MIN(340, screenBounds.size.width - 32);
    CGFloat x = (screenBounds.size.width - w) / 2;
    CGFloat topY = 100;

    UIView *panel = [[UIView alloc] initWithFrame:CGRectMake(x, topY, w, 420)];
    panel.backgroundColor = [UIColor colorWithRed:0.17 green:0.18 blue:0.2 alpha:1.0];
    panel.layer.cornerRadius = 16;
    panel.layer.shadowColor = [UIColor blackColor].CGColor;
    panel.layer.shadowOpacity = 0.5;
    panel.layer.shadowOffset = CGSizeMake(0, 4);
    panel.layer.shadowRadius = 20;

    UILabel *titleLabel = [[UILabel alloc] initWithFrame:CGRectMake(16, 12, w - 50, 24)];
    titleLabel.text = @"Vencord iOS";
    titleLabel.textColor = [UIColor whiteColor];
    titleLabel.font = [UIFont boldSystemFontOfSize:17];
    [panel addSubview:titleLabel];

    UIButton *closeBtn = [UIButton buttonWithType:UIButtonTypeSystem];
    closeBtn.frame = CGRectMake(w - 40, 8, 32, 32);
    [closeBtn setTitle:@"\u2715" forState:UIControlStateNormal];
    [closeBtn setTitleColor:[UIColor lightGrayColor] forState:UIControlStateNormal];
    closeBtn.titleLabel.font = [UIFont systemFontOfSize:18];
    [closeBtn addTarget:[VencordHandler shared] action:@selector(closeTapped) forControlEvents:UIControlEventTouchUpInside];
    [panel addSubview:closeBtn];

    UIScrollView *scrollView = [[UIScrollView alloc] initWithFrame:CGRectMake(0, 44, w, 370)];
    scrollView.showsVerticalScrollIndicator = YES;

    CGFloat yPos = 0;
    for (int i = 0; i < (int)pluginEntries.count; i++) {
        VencordPluginEntry *entry = pluginEntries[i];
        UIView *row = [[UIView alloc] initWithFrame:CGRectMake(8, yPos, w - 16, 56)];

        UISwitch *toggle = [[UISwitch alloc] initWithFrame:CGRectMake(w - 68, 4, 51, 31)];
        toggle.on = entry.enabled;
        toggle.tag = i;
        toggle.onTintColor = [UIColor colorWithRed:0.345 green:0.396 blue:0.949 alpha:1.0];
        [toggle addTarget:[VencordHandler shared] action:@selector(toggleChanged:) forControlEvents:UIControlEventValueChanged];

        UILabel *nameLabel = [[UILabel alloc] initWithFrame:CGRectMake(8, 2, w - 90, 20)];
        nameLabel.text = entry.pluginName;
        nameLabel.textColor = [UIColor whiteColor];
        nameLabel.font = [UIFont systemFontOfSize:14 weight:UIFontWeightMedium];

        UILabel *descLabel = [[UILabel alloc] initWithFrame:CGRectMake(8, 22, w - 90, 20)];
        descLabel.text = entry.pluginDesc;
        descLabel.textColor = [UIColor lightGrayColor];
        descLabel.font = [UIFont systemFontOfSize:11];

        UIView *separator = [[UIView alloc] initWithFrame:CGRectMake(8, 52, w - 16, 0.5)];
        separator.backgroundColor = [UIColor colorWithWhite:0.3 alpha:0.5];

        [row addSubview:nameLabel];
        [row addSubview:descLabel];
        [row addSubview:toggle];
        [row addSubview:separator];
        [scrollView addSubview:row];

        yPos += 56;
    }
    scrollView.contentSize = CGSizeMake(w, yPos);
    [panel addSubview:scrollView];

    UIWindow *keyWindow = nil;
    for (UIWindow *win in [UIApplication sharedApplication].windows) {
        if (win.isKeyWindow) { keyWindow = win; break; }
    }
    if (!keyWindow) keyWindow = [UIApplication sharedApplication].windows.firstObject;
    [keyWindow addSubview:panel];

    vencordSettingsPanel = panel;
}

@end

void createOverlayButton(void) {
    if (vencordOverlayButton) return;

    CGRect screenBounds = [UIScreen mainScreen].bounds;
    CGFloat btnSize = 48;

    UIView *btn = [[UIView alloc] initWithFrame:CGRectMake(screenBounds.size.width - 64, screenBounds.size.height - 160, btnSize, btnSize)];
    btn.backgroundColor = [UIColor colorWithRed:0.345 green:0.396 blue:0.949 alpha:1.0];
    btn.layer.cornerRadius = btnSize / 2;
    btn.clipsToBounds = YES;
    btn.layer.shadowColor = [UIColor colorWithRed:0.345 green:0.396 blue:0.949 alpha:1.0].CGColor;
    btn.layer.shadowOpacity = 0.5;
    btn.layer.shadowOffset = CGSizeMake(0, 2);
    btn.layer.shadowRadius = 8;

    UILabel *vLabel = [[UILabel alloc] initWithFrame:btn.bounds];
    vLabel.text = @"V";
    vLabel.textColor = [UIColor whiteColor];
    vLabel.font = [UIFont boldSystemFontOfSize:22];
    vLabel.textAlignment = NSTextAlignmentCenter;
    [btn addSubview:vLabel];

    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:[VencordHandler shared] action:@selector(buttonTapped)];
    [btn addGestureRecognizer:tap];

    UIPanGestureRecognizer *pan = [[UIPanGestureRecognizer alloc] initWithTarget:[VencordHandler shared] action:@selector(buttonPanned:)];
    [btn addGestureRecognizer:pan];

    UIWindow *keyWindow = nil;
    for (UIWindow *w in [UIApplication sharedApplication].windows) {
        if (w.isKeyWindow) { keyWindow = w; break; }
    }
    if (!keyWindow) keyWindow = [UIApplication sharedApplication].windows.firstObject;
    [keyWindow addSubview:btn];

    vencordOverlayButton = btn;
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

        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(3.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            vencordLog(@"Creating native overlay button...");
            createOverlayButton();
            vencordLog(@"Overlay button created");
            flushLog();
        });

        vencordLog(@"Constructor complete");
        flushLog();
    }
}
