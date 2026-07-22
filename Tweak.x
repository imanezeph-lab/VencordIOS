#import <UIKit/UIKit.h>
#import <JavaScriptCore/JavaScriptCore.h>
#import <Foundation/Foundation.h>
#import <objc/runtime.h>

static BOOL vencordInitialized = NO;
static JSContext *globalJSContext = nil;

static NSMutableDictionary<NSString *, NSNumber *> *pluginStates = nil;
static NSString *pluginStatesPath = nil;

#pragma mark - Plugin State Management

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
            NSLog(@"[VencordIOS] Failed to load %@: %@", name, error.localizedDescription);
            return nil;
        }
        return code;
    } @catch (NSException *e) {
        NSLog(@"[VencordIOS] Exception loading %@: %@", name, e);
        return nil;
    }
}

void evalJSFile(JSContext *context, NSString *name) {
    NSString *code = loadJSFile(name);
    if (code) {
        @try {
            [context evaluateScript:code];
            NSLog(@"[VencordIOS] Loaded %@", name);
        } @catch (NSException *e) {
            NSLog(@"[VencordIOS] Error evaluating %@: %@", name, e);
        }
    }
}

#pragma mark - JavaScript Injection

void injectVencordJS(JSContext *context) {
    if (!context || vencordInitialized) return;

    @try {
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
        } @catch (NSException *e) {
            NSLog(@"[VencordIOS] applyPatches error: %@", e);
        }

        vencordInitialized = YES;
        NSLog(@"[VencordIOS] All plugins loaded and patches applied");
    } @catch (NSException *exception) {
        NSLog(@"[VencordIOS] JS Injection error: %@", exception);
    }
}

#pragma mark - Swizzle RCTBridge to capture JSContext

static JSContext *capturedContext = nil;

typedef JSContext *(*jsContextFunc)(id self, SEL _cmd);

static jsContextFunc originalJsContext = NULL;

JSContext *swizzledJsContext(id self, SEL _cmd) {
    JSContext *ctx = originalJsContext(self, _cmd);
    if (ctx && !vencordInitialized) {
        capturedContext = ctx;
        globalJSContext = ctx;
        NSLog(@"[VencordIOS] Captured JSContext from RCTBridge");
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
        // Try to hook RCTBridge jsContext using runtime swizzling
        Class rctBridgeClass = objc_getClass("RCTBridge");
        if (rctBridgeClass) {
            SEL sel = sel_registerName("jsContext");
            Method method = class_getInstanceMethod(rctBridgeClass, sel);
            if (method) {
                originalJsContext = (jsContextFunc)method_getImplementation(method);
                method_setImplementation(method, (IMP)swizzledJsContext);
                NSLog(@"[VencordIOS] Hooked RCTBridge.jsContext via swizzling");
            } else {
                NSLog(@"[VencordIOS] RCTBridge found but jsContext method not found");
            }
        } else {
            NSLog(@"[VencordIOS] RCTBridge class not found, trying alternatives...");
        }

        // Also try to hook via NSNotificationCenter for React Native init
        [[NSNotificationCenter defaultCenter] addObserverForName:@"RCTContentDidAppearNotification"
                                                            object:nil
                                                             queue:[NSOperationQueue mainQueue]
                                                        usingBlock:^(NSNotification *note) {
            if (!vencordInitialized) {
                NSLog(@"[VencordIOS] RCTContentDidAppearNotification received");
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                    if (!vencordInitialized && globalJSContext) {
                        loadPluginStates();
                        injectVencordJS(globalJSContext);
                    }
                });
            }
        }];

        // Try to find JSContext through existing bridges
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(8.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            if (!vencordInitialized) {
                NSLog(@"[VencordIOS] Fallback: trying to find JSContext...");
                // Try finding through UIWebView or WKWebView
                for (UIWindow *window in [UIApplication sharedApplication].windows) {
                    NSArray *subviews = window.rootViewController.view.subviews;
                    for (UIView *view in subviews) {
                        NSString *className = NSStringFromClass([view class]);
                        if ([className containsString:@"RCT"] || [className containsString:@"Root"]) {
                            NSLog(@"[VencordIOS] Found view: %@", className);
                        }
                    }
                }

                // Last resort: try to access JSContext through [JSContext currentContext]
                JSContext *ctx = [JSContext currentContext];
                if (ctx) {
                    globalJSContext = ctx;
                    loadPluginStates();
                    injectVencordJS(ctx);
                }
            }
        });

    } @catch (NSException *e) {
        NSLog(@"[VencordIOS] Hook setup error: %@", e);
    }
}

#pragma mark - Constructor

__attribute__((constructor))
static void vencordInit(void) {
    @autoreleasepool {
        NSLog(@"[VencordIOS] Dylib loaded - Vencord for iOS v1.0.0");
        loadPluginStates();
        setupHooks();
    }
}
