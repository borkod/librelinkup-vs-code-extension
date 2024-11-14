# LibreLinkUp Extension for Visual Studio Code

[LibreLinkUp](https://www.librelinkup.com/) allows remote monitoring the glucose levels of users of Freestyle Libre sensor. It provides real-time data, alerts, and trends to help manage diabetes care from a distance.

This Visual Studio Code extension retrieves the most recent blood glucose reading from your LibreLinkUp and displays it in your Visual Studio Code status bar. It can be used to monitor glucose levels of a friend or family member. Alternatively, it can be used to display your own glucose measurements.

If you are not a FreeStyle Libre user and use a different CGM, you may be interested in [Nightscout Extension for Visual Studio Code](https://github.com/borkod/vs-code-nightscout-status-bar/tree/main).

![LibreLinkUp Extension for Visual Studio Code](https://raw.githubusercontent.com/borkod/librelinkup-vs-code-extension/main/images/librelinkup-vs-code.gif)

## Features

- Periodically retrieves the most recent blood glucose reading from your LibreLinkUp and displays it in your Visual Studio Code Status bar
- Provides visual indicator of your blood glucose levels trend
- Provides `LibreLinkUp: Update and Show Last Entry Date` command to manually trigger an update and display the date and time of the latest reading in your LibreLinkUp
  - Command can be triggered by clicking on your blood glucose reading in the status bar or via VS Code Command Palette
- Low and high blood glucose level warnings
- Status bar background color change on low or high blood glucose level warnings
- Fully configurable settings

## Requirements

Detailed information and instructions on setting up and using LibreLinkUp app can be found in the app [FAQ](https://www.librelinkup.com/faqs).

- You need the LibreLinkUp app
  - If you have an Android smartphone, you can download the app from the Google Play store.  If you have an iPhone, you can download the app from the App Store.
- You need a LibreLinkUp account.
  - The FreeStyle Libre app user must initiate the connection.
  - If you wish to monitor your own blood glucose levels, you can invite yourself
  - Have the FreeStyle Libre app user open the FreeStyle Libre app on their smartphone, then:
    - Open the Navigation Menu
    - Tap Connected Apps
    - Under LibreLinkUp, Tap Connect or Manage
    - Tap "Add Connection"
    - Enter your (LibreLinkUp user) first name, last name, and e-mail address
    - Tap "Add" to send the invitation
  - When the FreeStyle Libre app user sends the invitation, you will receive an email with instructions on how to download the LibreLinkUp app and register for an account
  - After you log into the LibreLinkUp app, accept the invitation to connect.

## Extension Settings

This extension contributes the following settings:

- `librelinkup-vs-code-extension.linkUpUsername`: LibreLink Up Login Email (e.g. `mail@example.com`).
- `librelinkup-vs-code-extension.linkUpPassword`: LibreLink Up Login Password.
- `librelinkup-vs-code-extension.linkUpRegion`: Your region. Used to determine the correct LibreLinkUp service (Possible values: AE, AP, AU, CA, DE, EU, EU2, FR, JP, US, LA).
- `librelinkup-vs-code-extension.linkUpConnection`: LibreLink Up Patient-ID. Can be received from the console output if multiple connections are available (e.g. `123456abc-abcd-efgh-7891def`).
- `librelinkup-vs-code-extension.glucoseUnits`: Blood glucose units. Supported units are mmol/L (Millimoles Per Litre) and mg/dL (Milligrams per 100 millilitres).
- `librelinkup-vs-code-extension.high-glucose-warning-message.enabled`: Enable high glucose warning pop-up message.
- `librelinkup-vs-code-extension.low-glucose-warning-message.enabled`: Enable low glucose warning pop-up message.
- `librelinkup-vs-code-extension.glucose-warning-background-color.enabled`: Enable high or low glucose warning background color.
- `librelinkup-vs-code-extension.updateInterval`: Time interval (in minutes) between queries for updated data.

## Debugging

This extension creates `LibreLinkUp CGM Output` output channel. Several info, warning, and error log messages are written to this channel. You can view this channel to inspect actions the extension is performing.

If you encounter any problems, open a GitHub [issue](https://github.com/borkod/librelinkup-vs-code-extension/issues).

## Acknowledgments

Code in the [Nightscout LibreLink Up Uploader/Sidecar](librelinkup-vs-code) was very useful as a reference when creating this extension.

## About

I was looking for a tool that would allow me to monitor my blood glucose levels without distractions. As a Visual Studio Code user, I believed that displaying the readings in the status bar would seamlessly integrate with my development environment.

I hope others find this tool helpful too!