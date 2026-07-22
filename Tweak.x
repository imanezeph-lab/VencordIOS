#import <UIKit/UIKit.h>
#import <JavaScriptCore/JavaScriptCore.h>
#import <Foundation/Foundation.h>

@interface DiscordAppDelegate : UIResponder <UIApplicationDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@interface RCTBridge : NSObject
- (JSContext *)jsContext;
@end

@interface RCTRootView : UIView
@property (nonatomic, readonly) RCTBridge *bridge;
@end

static BOOL vencordInitialized = NO;
static BOOL noTrackEnabled = YES;
static BOOL silentTypingEnabled = FALSE;
static BOOL showHiddenServersEnabled = TRUE;
static BOOL forceDarkModeEnabled = FALSE;
static BOOL noReplyTimeoutEnabled = TRUE;
static BOOL alwaysExpandEmbedsEnabled = TRUE;
static BOOL blurNSFWEnabled = FALSE;
static BOOL messageLoggerEnabled = FALSE;

static NSArray<NSDictionary *> *enabledPlugins = nil;
static NSMutableDictionary<NSString *, NSNumber *> *pluginStates = nil;

static NSString *pluginStatesPath = nil;
static JSContext *globalJSContext = nil;

#pragma mark - Plugin State Management

void savePluginStates(void) {
    if (!pluginStatesPath || !pluginStates) return;
    NSData *data = [NSPropertyListSerialization dataWithPropertyList:pluginStates
                                                              format:NSPropertyListBinaryFormat_v1_0
                                                             options:0
                                                               error:nil];
    [data writeToFile:pluginStatesPath atomically:YES];
}

void loadPluginStates(void) {
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
}

BOOL isPluginEnabled(NSString *pluginId) {
    if (!pluginStates) loadPluginStates();
    NSNumber *state = pluginStates[pluginId];
    return state ? [state boolValue] : YES;
}

void setPluginEnabled(NSString *pluginId, BOOL enabled) {
    if (!pluginStates) loadPluginStates();
    pluginStates[pluginId] = @(enabled);
    savePluginStates();
}

#pragma mark - JS File Loader

NSString *loadJSFile(NSString *name) {
    NSString *pluginsDir = [[[NSBundle mainBundle] bundlePath]
                            stringByAppendingPathComponent:@"VencordJS/plugins"];
    NSString *path = [pluginsDir stringByAppendingPathComponent:
                      [name stringByAppendingString:@".js"]];
    NSError *error = nil;
    NSString *code = [NSString stringWithContentsOfFile:path
                                               encoding:NSUTF8StringEncoding
                                                  error:&error];
    if (error) {
        NSLog(@"[VencordIOS] Failed to load %@: %@", name, error.localizedDescription);
    }
    return code;
}

void evalJSFile(JSContext *context, NSString *name) {
    NSString *code = loadJSFile(name);
    if (code) {
        [context evaluateScript:code];
        NSLog(@"[VencordIOS] Loaded %@", name);
    } else {
        NSLog(@"[VencordIOS] Could not load %@.js", name);
    }
}

#pragma mark - JavaScript Injection

void injectVencordJS(JSContext *context) {
    if (!context || vencordInitialized) return;

    @try {
        evalJSFile(context, @"vencordCore");

        if (isPluginEnabled(@"noTrack")) {
            evalJSFile(context, @"noTrack");
        }
        if (isPluginEnabled(@"silentTyping")) {
            evalJSFile(context, @"silentTyping");
        }
        if (isPluginEnabled(@"messageLogger")) {
            evalJSFile(context, @"messageLogger");
        }
        if (isPluginEnabled(@"betterEmbeds")) {
            evalJSFile(context, @"betterEmbeds");
        }
        if (isPluginEnabled(@"noReplyTimeout")) {
            evalJSFile(context, @"noReplyTimeout");
        }
        if (isPluginEnabled(@"showHiddenServers")) {
            evalJSFile(context, @"showHiddenServers");
        }
        if (isPluginEnabled(@"blurNSFW")) {
            evalJSFile(context, @"blurNSFW");
        }
        if (isPluginEnabled(@"betterStatus")) {
            evalJSFile(context, @"betterStatus");
        }
        if (isPluginEnabled(@"emojiUtilities")) {
            evalJSFile(context, @"emojiUtilities");
        }
        if (isPluginEnabled(@"multiAccount")) {
            evalJSFile(context, @"multiAccount");
        }
        if (isPluginEnabled(@"voiceOptimizer")) {
            evalJSFile(context, @"voiceOptimizer");
        }
        if (isPluginEnabled(@"unlimitedServers")) {
            evalJSFile(context, @"unlimitedServers");
        }

        evalJSFile(context, @"vencordAllPlugins");

        evalJSFile(context, @"vcSettingsUI");

        [context evaluateScript:@"if(window.Vencord){Vencord.applyPatches();}"];

        vencordInitialized = YES;
        NSLog(@"[VencordIOS] All plugins loaded and patches applied");
    } @catch (NSException *exception) {
        NSLog(@"[VencordIOS] JS Injection error: %@", exception);
    }
}

#pragma mark - Hook React Native Bridge

%hook RCTBridge

- (JSContext *)jsContext {
    JSContext *ctx = %orig;
    if (ctx && !vencordInitialized) {
        globalJSContext = ctx;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            loadPluginStates();
            injectVencordJS(globalJSContext);
        });
    }
    return ctx;
}

%end

#pragma mark - Hook AppDelegate for initialization

%hook DiscordAppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    BOOL result = %orig;

    NSLog(@"[VencordIOS] Discord launched - initializing Vencord...");

    loadPluginStates();

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(3.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (globalJSContext && !vencordInitialized) {
            injectVencordJS(globalJSContext);
        }
    });

    return result;
}

%end

#pragma mark - Hook React Native View for fallback injection

%hook RCTRootView

- (void)layoutSubviews {
    %orig;

    if (!vencordInitialized && globalJSContext) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            if (!vencordInitialized) {
                injectVencordJS(globalJSContext);
            }
        });
    }
}

%end

#pragma mark - Constructor

%ctor {
    @autoreleasepool {
        NSLog(@"[VencordIOS] Tweak loaded - Vencord for iOS v1.0.0");
        loadPluginStates();
    }
}
