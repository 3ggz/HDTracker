import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.

        // Capacitor's WKWebView ships with edge-swipe back/forward navigation
        // off. In remote mode every page is a real navigation, so enabling it
        // restores the iOS swipe-to-go-back gesture users expect from Safari.
        if let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
           let webView = bridgeVC.webView {
            webView.allowsBackForwardNavigationGestures = true

            // Paint the WebView + its scroll view with a theme-adaptive
            // background so the iOS safe-area strips (status bar, home
            // indicator) and rubber-band overscroll show the app's background
            // color instead of the default white — the reported white bleed
            // above the header and under the footer in dark mode. Follows the
            // system light/dark appearance, which the web app also defaults to.
            // #fafafa light / #0a0a0a dark mirror globals.css --background.
            let themeBackground = UIColor { traits in
                traits.userInterfaceStyle == .dark
                    ? UIColor(red: 0x0a / 255.0, green: 0x0a / 255.0, blue: 0x0a / 255.0, alpha: 1)
                    : UIColor(red: 0xfa / 255.0, green: 0xfa / 255.0, blue: 0xfa / 255.0, alpha: 1)
            }
            webView.backgroundColor = themeBackground
            webView.scrollView.backgroundColor = themeBackground
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
