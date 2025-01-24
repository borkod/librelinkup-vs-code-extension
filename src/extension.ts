// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios from "axios";
import {LLU_API_ENDPOINTS} from "./constants/llu-api-endpoints";
import {linkUpConfig} from "./interfaces/config";
import {LoginResponse} from "./interfaces/librelink/login-response";
import {ConnectionsResponse} from "./interfaces/librelink/connections-response";
import {GraphData, GraphResponse} from "./interfaces/librelink/graph-response";
import {AuthTicket, Connection, GlucoseItem, GlucoseMeasurement} from "./interfaces/librelink/common";
import {LibreLinkUpHttpHeaders} from "./interfaces/http-headers";
import {CookieJar} from "tough-cookie";
import {HttpCookieAgent} from "http-cookie-agent/http";
import {Agent as HttpAgent} from "node:http";
import {Agent as HttpsAgent} from "node:https";
import * as crypto from "crypto";

// Generate new Ciphers for stealth mode in order to bypass SSL fingerprinting used by Cloudflare.
// The new Ciphers are then used in the HTTPS Agent for Axios.
const defaultCiphers: Array<string> = crypto.constants.defaultCipherList.split(":");
const stealthCiphers: Array<string> = [
    defaultCiphers[0],
    defaultCiphers[2],
    defaultCiphers[1],
    ...defaultCiphers.slice(3)
];

const stealthHttpsAgent: HttpsAgent = new HttpsAgent({
    ciphers: stealthCiphers.join(":")
});

// last known authTicket
let authTicket: AuthTicket = {duration: 0, expires: 0, token: ""};

// Set User-Agent
const USER_AGENT = "Mozilla/5.0 (iPhone; CPU OS 17_4.1 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/17.4.1 Mobile/10A5355d Safari/8536.25";

// LibreLink Up API Settings (Don't change this unless you know what you are doing)

const LIBRE_LINK_UP_VERSION = "4.10.0";
const LIBRE_LINK_UP_PRODUCT = "llu.ios";

// Set the default LibreLink Up HTTP headers
const libreLinkUpHttpHeaders: LibreLinkUpHttpHeaders = {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json;charset=UTF-8",
    "version": LIBRE_LINK_UP_VERSION,
    "product": LIBRE_LINK_UP_PRODUCT
};

// Create a new CookieJar and HttpCookieAgent for Axios to handle cookies.
const jar: CookieJar = new CookieJar();
const cookieAgent: HttpAgent = new HttpCookieAgent({cookies: {jar}});

let myStatusBarItem: vscode.StatusBarItem;

// Variable to hold the timeout ID
let updateTimeout: NodeJS.Timeout;

// Output channel for logging
let logOutputChannel : vscode.LogOutputChannel;

let myConfig: linkUpConfig;

let currentResult: GlucoseMeasurement = {
    FactoryTimestamp: "",
    Timestamp: "",
    type: 1,
    ValueInMgPerDl: 0,
    TrendArrow: 0,
    TrendMessage: "",
    MeasurementColor: 0,
    GlucoseUnits: 0,
    Value: 0,
    isHigh: false,
    isLow: false,
};

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {

    // Create a new output channel for logging
	logOutputChannel = vscode.window.createOutputChannel("LibreLinkUp CGM Output", {log: true});

    logOutputChannel.info('Extension "librelinkup-vs-code-extension" is now active!');

    // Set the configuration for the extension
	myConfig = updateConfig();

    // Listening to configuration changes
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('librelinkup-vs-code-extension')) {
			myConfig = updateConfig();
			updateStatusBarItem();
		}
	}));

    // Register the command to show the date of the last entry
	const myCommandId = 'librelinkup-vs-code-extension.update-and-show-date';
	const disposable = vscode.commands.registerCommand(myCommandId, () => {
		updateStatusBarItemAndShowDate();
	});
	
    // create a new status bar item
	myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	myStatusBarItem.command = myCommandId;
	context.subscriptions.push(myStatusBarItem);

    // update status bar item once at start
	myStatusBarItem.text = `---`;
	myStatusBarItem.show();
	updateStatusBarItem();
	// Manage the timeout lifecycle
    context.subscriptions.push({
        dispose: () => {
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
        }
    });

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

// Function to schedule the next update
function scheduleUpdate() {
	// Clear any existing timeout to prevent multiple timers
	if (updateTimeout) {
		clearTimeout(updateTimeout);
	}
    // Calculate the interval in milliseconds
    const interval = myConfig.updateInterval * 60 * 1000;
    // Schedule the next update
    updateTimeout = setTimeout(() => {
        updateStatusBarItem();
    }, interval);
}

// Function to update the status bar item and show the date of the last entry
function updateStatusBarItemAndShowDate(): void {
	updateStatusBarItem().then(() => {
		if (currentResult.Value > 0) {
			vscode.window.showInformationMessage(`LibreLinkUp CGM last entry at: ${currentResult.Timestamp}`);
		} else {
			vscode.window.showInformationMessage(`No data available.`);
		}
	});
}

// Async function to get the latest data and update the status bar item
async function updateStatusBarItem(): Promise<void> {
	fetchData()
		.then((newResult) => {
			// Update the current result
			currentResult = newResult;
			// Update the status bar item
			if (currentResult.Value > 0) {
				let sgv = currentResult.ValueInMgPerDl;
				let units = "mg/dL";
				if (myConfig.glucoseUnits === 'millimolar') {
					sgv = currentResult.ValueInMgPerDl / 18;
					units = "mmol/L";
				}
				// Get the trend icon based on the direction
				let icon = getTrendIcon(currentResult.TrendArrow);
				myStatusBarItem.text = `${sgv.toFixed(1)} ${units} ${icon}`;
				myStatusBarItem.show();
				showWarning();
			// If no data is available
			} else {
				myStatusBarItem.text = `---`;
				myStatusBarItem.show();
			}
		})
		// Catch any errors and log them
		.catch((error) => {
			logOutputChannel.error('Error fetching data:', error);
			currentResult = {
                FactoryTimestamp: "",
                Timestamp: "",
                type: 1,
                ValueInMgPerDl: 0,
                TrendArrow: 0,
                TrendMessage: "",
                MeasurementColor: 0,
                GlucoseUnits: 0,
                Value: 0,
                isHigh: false,
                isLow: false,
            };
			vscode.window.showErrorMessage(`Error fetching data: ${error.message || error}`);
			myStatusBarItem.text = `---`;
			myStatusBarItem.show();
		})
		.finally(() => {
			// Schedule the next update after completing the current one
			scheduleUpdate();
		});
}

// Function to show a warning message if the glucose level is too low or too high
function showWarning(): void {
	if (currentResult.ValueInMgPerDl > 0 && currentResult.isLow && myConfig.lowGlucoseWarningEnabled) {
		vscode.window.showWarningMessage(`Low blood glucose!`);
	} else if (currentResult.ValueInMgPerDl > 0 && currentResult.isHigh && myConfig.highGlucoseWarningEnabled) {
		vscode.window.showWarningMessage(`High blood glucose!`);
	}

	if (currentResult.ValueInMgPerDl > 0 && (currentResult.MeasurementColor === 2 || currentResult.MeasurementColor === 3) && myConfig.glucoseWarningBackgroundEnabled) {
		myStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
	} else if (currentResult.ValueInMgPerDl > 0 && currentResult.MeasurementColor === 4 && myConfig.glucoseWarningBackgroundEnabled) {
		myStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
	} else {
		myStatusBarItem.backgroundColor = undefined;
	}
}

async function fetchData(): Promise<GlucoseMeasurement> {

	if (!hasValidAuthentication())
	{
		logOutputChannel.info("Renewing token");
		deleteAuthTicket();
		const authTicket: AuthTicket | null = await login();
		if (!authTicket)
		{
			logOutputChannel.error("Error: LibreLink Up - No AuthTicket received. Please check your credentials.");
			deleteAuthTicket();
            let nullResult = {
                FactoryTimestamp: "",
                Timestamp: "",
                type: 1,
                ValueInMgPerDl: 0,
                TrendArrow: 0,
                TrendMessage: "",
                MeasurementColor: 0,
                GlucoseUnits: 0,
                Value: 0,
                isHigh: false,
                isLow: false,
            };
			return nullResult;
		}
		updateAuthTicket(authTicket);
	}

	const glucoseGraphData: GraphData | null = await getGlucoseMeasurements();

    if (!glucoseGraphData)
    {
        let nullResult = {
            FactoryTimestamp: "",
            Timestamp: "",
            type: 1,
            ValueInMgPerDl: 0,
            TrendArrow: 0,
            TrendMessage: "",
            MeasurementColor: 0,
            GlucoseUnits: 0,
            Value: 0,
            isHigh: false,
            isLow: false,
        };
        return nullResult;
    }

	logOutputChannel.info("Received glucose measurement: " + JSON.stringify(glucoseGraphData.connection.glucoseMeasurement));
    return glucoseGraphData.connection.glucoseMeasurement;
}

function hasValidAuthentication(): boolean
{
    if (authTicket.expires !== undefined)
    {
        const currentDate = Math.round(new Date().getTime() / 1000);
        return currentDate < authTicket.expires;
    }

	logOutputChannel.info("No authTicket.expires");

    return false;
}

function deleteAuthTicket(): void
{
    authTicket = {duration: 0, expires: 0, token: ""};
}

function updateAuthTicket(newAuthTicket: AuthTicket): void
{
    authTicket = newAuthTicket;
}

export async function login(): Promise<AuthTicket | null>
{    
    logOutputChannel.info("Logging in to LibreLink Up");
    try
    {
        let LIBRE_LINK_UP_URL = LLU_API_ENDPOINTS[myConfig.linkUpRegion];
        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/auth/login";
        const response: { data: LoginResponse } = await axios.post(
            url,
            {
                email: myConfig.linkUpUsername,
                password: myConfig.linkUpPassword,
            },
            {
                headers: libreLinkUpHttpHeaders,
                withCredentials: true, // Enable automatic cookie handling
                httpAgent: cookieAgent,
                httpsAgent: stealthHttpsAgent
            });

        try
        {
            if (response.data.status !== 0)
            {
				logOutputChannel.error(`Error: LibreLink Up - Non-zero status code: ${JSON.stringify(response.data)}`);
                return null;
            }
            if (response.data.data.redirect === true && response.data.data.region)
            {
                const correctRegion = response.data.data.region.toUpperCase();
				logOutputChannel.error(`Error: LibreLink Up - Logged in to the wrong region. Switch to '${correctRegion}' region.`);
                return null;
            }
			logOutputChannel.info("Logged in to LibreLink Up");
            return response.data.data.authTicket;
        } catch (err)
        {
			logOutputChannel.error("Error: LibreLink Up - Invalid authentication token. Please check your LibreLink Up credentials", err);
            return null;
        }
    } catch (error)
    {
		logOutputChannel.error("Error: LibreLink Up - Invalid credentials", error);
        return null;
    }
}

export async function getGlucoseMeasurements(): Promise<GraphData | null>
{
    logOutputChannel.info("Getting glucose measurements");
    try
    {
        const connectionId = await getLibreLinkUpConnection();
        if (!connectionId)
        {
            return null;
        }

        let LIBRE_LINK_UP_URL = LLU_API_ENDPOINTS[myConfig.linkUpRegion];
        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/connections/" + connectionId + "/graph";
        const response: { data: GraphResponse } = await axios.get(
            url,
            {
                headers: getLluAuthHeaders(),
                withCredentials: true, // Enable automatic cookie handling
                httpAgent: cookieAgent,
                httpsAgent: stealthHttpsAgent,
            });

        return response.data.data;
    } catch (error)
    {
		logOutputChannel.error("Error getting glucose measurements", error);
        deleteAuthTicket();
        return null;
    }
}

export async function getLibreLinkUpConnection(): Promise<string | null>
{
    logOutputChannel.info("Getting LibreLink Up connection");
    try
    {
        let LIBRE_LINK_UP_URL = LLU_API_ENDPOINTS[myConfig.linkUpRegion];
        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/connections";
        const response: { data: ConnectionsResponse } = await axios.get(
            url,
            {
                headers: getLluAuthHeaders(),
                withCredentials: true, // Enable automatic cookie handling
                httpAgent: cookieAgent,
                httpsAgent: stealthHttpsAgent,
            });

        const connectionData = response.data.data;

        if (connectionData.length === 0)
        {
			logOutputChannel.error("No LibreLink Up connection found");
            return null;
        }

        if (connectionData.length === 1)
        {
			logOutputChannel.info("Found 1 LibreLink Up connection.");
            logPickedUpConnection(connectionData[0]);
            return connectionData[0].patientId;
        }

        dumpConnectionData(connectionData);

        if (!myConfig.linkUpConnection)
        {
			logOutputChannel.debug("No Patient-ID in the configuration specified.");
            logPickedUpConnection(connectionData[0]);
            return connectionData[0].patientId;
        }

        const connection = connectionData.filter(connectionEntry => connectionEntry.patientId === myConfig.linkUpConnection)[0];

        if (!connection)
        {
			logOutputChannel.error("The specified Patient-ID was not found.");
            return null;
        }

        logPickedUpConnection(connection);
        return connection.patientId;
    } catch (error)
    {
		logOutputChannel.error("Error getting libreLinkUpConnection: ", error);
        deleteAuthTicket();
        return null;
    }
}

function getLluAuthHeaders(): LibreLinkUpHttpHeaders
{
    const authenticatedHttpHeaders = libreLinkUpHttpHeaders;
    authenticatedHttpHeaders.Authorization = "Bearer " + getAuthenticationToken();
	logOutputChannel.debug("authenticatedHttpHeaders: " + JSON.stringify(authenticatedHttpHeaders));;
    return authenticatedHttpHeaders;
}

function getAuthenticationToken(): string | null
{
    if (authTicket.token)
    {
        return authTicket.token;
    }

	logOutputChannel.warn("no authTicket.token");

    return null;
}

function logPickedUpConnection(connection: Connection): void
{
    logOutputChannel.info(
        "-> The following connection will be used: " + connection.firstName + " " + connection.lastName + " (Patient-ID: " +
        connection.patientId + ")");
}

function dumpConnectionData(connectionData: Connection[]): void
{
    logOutputChannel.debug("Found " + connectionData.length + " LibreLink Up connections:");
    connectionData.map((connectionEntry: Connection, index: number) =>
    {
        logOutputChannel.debug("[" + (index + 1) + "] " + connectionEntry.firstName + " " + connectionEntry.lastName + " (Patient-ID: " +
            connectionEntry.patientId + ")");
    });
}

function updateConfig(): linkUpConfig
{
    // Get the configuration object for the extension
    const config = vscode.workspace.getConfiguration('librelinkup-vs-code-extension');
    logOutputChannel.info('Updating configuration.');
	return {
        glucoseUnits: config.get<string>('glucoseUnits', 'milligrams'),
		linkUpUsername: config.get<string>('linkUpUsername', ''),
		linkUpPassword: config.get<string>('linkUpPassword', ''),
		linkUpRegion: config.get<string>('linkUpRegion', ''),
		linkUpConnection: config.get<string>('linkUpConnection', ''),
        lowGlucoseWarningEnabled: config.get<boolean>('low-glucose-warning-message.enabled', true),
        glucoseWarningBackgroundEnabled: config.get<boolean>('glucose-warning-background-color.enabled', true),
	    highGlucoseWarningEnabled: config.get<boolean>('high-glucose-warning-message.enabled', true),
        updateInterval: config.get<number>('updateInterval', 10),
	};
}

// Function to get the trend icon based on the direction
function getTrendIcon(direction: number): string {
	switch (direction) {
		case 3:
			return '→';
		case 5:
			return '↑';
		case 1:
			return '↓';
		case 4:
			return '↗';
		case 2:
			return '↘';
		default:
			return '??';
	}
}