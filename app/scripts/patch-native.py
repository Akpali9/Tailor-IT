#!/usr/bin/env python3
"""Re-applies Tailor IT's native configuration after `npx cap add android|ios`.
Idempotent: safe to run repeatedly. Run from the app/ folder."""
import os, re, sys

def patch_android():
    p = "android/app/src/main/AndroidManifest.xml"
    if not os.path.exists(p): return print("android/ not found, skipping")
    s = open(p).read()
    if 'android:scheme="tailorit"' in s: return print("android: already patched")
    s = s.replace('android:allowBackup="true"', 'android:allowBackup="false"\n        android:usesCleartextTraffic="false"')
    s = s.replace('android:launchMode="singleTask"', 'android:launchMode="singleTask"\n            android:screenOrientation="portrait"')
    s = s.replace("""            </intent-filter>

        </activity>""", """            </intent-filter>

            <!-- Deep links: payment return, payout return, email confirm / password reset -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="tailorit" />
            </intent-filter>

        </activity>""")
    s = s.replace('<uses-permission android:name="android.permission.INTERNET" />', '''<uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />''')
    open(p, "w").write(s); print("android: patched")

def patch_ios():
    p = "ios/App/App/Info.plist"
    if not os.path.exists(p): return print("ios/ not found, skipping")
    s = open(p).read()
    if "CFBundleURLTypes" in s: return print("ios: already patched")
    bundle = re.search(r'appId:\s*"([^"]+)"', open("capacitor.config.ts").read()).group(1)
    s = s.replace("<string>armv7</string>", "<string>arm64</string>")
    s = re.sub(r"(<key>UISupportedInterfaceOrientations</key>\s*<array>)(.*?)(</array>)",
               lambda m: m.group(1) + "\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t" + m.group(3), s, count=1, flags=re.S)
    extra = f"""\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>{bundle}</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array><string>tailorit</string></array>
\t\t</dict>
\t</array>
\t<key>NSCameraUsageDescription</key>
\t<string>Tailor IT uses your camera so you can take a photo for virtual try-on and measurement estimates, and add photos of your designs.</string>
\t<key>NSPhotoLibraryUsageDescription</key>
\t<string>Tailor IT needs access to your photos so you can choose a picture for virtual try-on or your profile.</string>
\t<key>ITSAppUsesNonExemptEncryption</key>
\t<false/>
\t<key>UIBackgroundModes</key>
\t<array><string>remote-notification</string></array>
"""
    s = s.replace("</dict>\n</plist>", extra + "</dict>\n</plist>")
    open(p, "w").write(s); print("ios: patched")

patch_android(); patch_ios()
