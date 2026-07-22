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

#pragma mark - Constructor

__attribute__((constructor))
static void vencordInit(void) {
    @autoreleasepool {
        // Set up logging immediately
        NSString *documentsPath = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
        NSString *vencordPath = [documentsPath stringByAppendingPathComponent:@"VencordIOS"];
        [[NSFileManager defaultManager] createDirectoryAtPath:vencordPath
                                  withIntermediateDirectories:YES
                                                   attributes:nil
                                                        error:nil];
        logFilePath = [vencordPath stringByAppendingPathComponent:@"vencord.log"];

        // Clear old log
        [@"" writeToFile:logFilePath atomically:YES encoding:NSUTF8StringEncoding error:nil];
        logBuffer = [NSMutableString string];

        vencordLog(@"=== Vencord for iOS v1.0.0 ===");
        vencordLog(@"Dylib loaded via constructor");
        vencordLog(@"Bundle path: %@", [[NSBundle mainBundle] bundlePath]);

        loadPluginStates();
        vencordLog(@"Plugin states loaded");

        setupHooks();
        vencordLog(@"Constructor complete");
        flushLog();
    }
}
