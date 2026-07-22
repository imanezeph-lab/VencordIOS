#import <UIKit/UIKit.h>
#import <JavaScriptCore/JavaScriptCore.h>
#import <Foundation/Foundation.h>
#import "VencordScripts.h"

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

#pragma mark - JavaScript Injection

void injectVencordJS(JSContext *context) {
    if (!context || vencordInitialized) return;

    @try {
        [context evaluateScript:vencordCoreJS];

        if (isPluginEnabled(@"noTrack")) {
            [context evaluateScript:noTrackJS];
        }
        if (isPluginEnabled(@"silentTyping")) {
            [context evaluateScript:silentTypingJS];
        }
        if (isPluginEnabled(@"messageLogger")) {
            [context evaluateScript:messageLoggerJS];
        }
        if (isPluginEnabled(@"betterEmbeds")) {
            [context evaluateScript:betterEmbedsJS];
        }
        if (isPluginEnabled(@"noReplyTimeout")) {
            [context evaluateScript:noReplyTimeoutJS];
        }
        if (isPluginEnabled(@"showHiddenServers")) {
            [context evaluateScript:showHiddenServersJS];
        }
        if (isPluginEnabled(@"blurNSFW")) {
            [context evaluateScript:blurNSFWJS];
        }
        if (isPluginEnabled(@"betterStatus")) {
            [context evaluateScript:betterStatusJS];
        }
        if (isPluginEnabled(@"emojiUtilities")) {
            [context evaluateScript:emojiUtilitiesJS];
        }
        if (isPluginEnabled(@"multiAccount")) {
            [context evaluateScript:multiAccountJS];
        }
        if (isPluginEnabled(@"voiceOptimizer")) {
            [context evaluateScript:voiceOptimizerJS];
        }
        if (isPluginEnabled(@"unlimitedServers")) {
            [context evaluateScript:unlimitedServersJS];
        }

        NSString *pluginsPath = [[NSBundle mainBundle] pathForResource:@"VencordJS/plugins/vencordAllPlugins" ofType:@"js"];
        if (pluginsPath) {
            NSString *pluginsCode = [NSString stringWithContentsOfFile:pluginsPath encoding:NSUTF8StringEncoding error:nil];
            if (pluginsCode) {
                [context evaluateScript:pluginsCode];
                NSLog(@"[VencordIOS] Loaded vencordAllPlugins.js (114 plugins)");
            }
        } else {
            NSLog(@"[VencordIOS] vencordAllPlugins.js not found in bundle");
        }

        [context evaluateScript:vcSettingsUIJS];

        [context evaluateScript:@"Vencord.applyPatches();"];

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
