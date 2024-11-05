// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios from "axios";
import {LLU_API_ENDPOINTS} from "./constants/llu-api-endpoints";
import {linkUpConfig} from "./interfaces/config";
import {LoginResponse} from "./interfaces/librelink/login-response";
import {ConnectionsResponse} from "./interfaces/librelink/connections-response";
import {GraphData, GraphResponse} from "./interfaces/librelink/graph-response";
import {AuthTicket, Connection, GlucoseItem} from "./interfaces/librelink/common";
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

const USER_AGENT = "Mozilla/5.0 (iPhone; CPU OS 17_4.1 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/17.4.1 Mobile/10A5355d Safari/8536.25";

// LibreLink Up API Settings (Don't change this unless you know what you are doing)

const LIBRE_LINK_UP_VERSION = "4.10.0";
const LIBRE_LINK_UP_PRODUCT = "llu.ios";
const LIBRE_LINK_UP_URL = LLU_API_ENDPOINTS["CA"]; // TODO: Fix this to use the region from the config

const libreLinkUpHttpHeaders: LibreLinkUpHttpHeaders = {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json;charset=UTF-8",
    "version": LIBRE_LINK_UP_VERSION,
    "product": LIBRE_LINK_UP_PRODUCT
}

// Create a new CookieJar and HttpCookieAgent for Axios to handle cookies.
const jar: CookieJar = new CookieJar();
const cookieAgent: HttpAgent = new HttpCookieAgent({cookies: {jar}})

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "librelinkup-vs-code-extension" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('librelinkup-vs-code-extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from librelinkup-vs-code-extension!');
		testFunction();
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function testFunction(): Promise<void> {
	console.log("Hello from the test function");

	if (!hasValidAuthentication())
	{
		console.log("Renew token");
		deleteAuthTicket();
		const authTicket: AuthTicket | null = await login();
		if (!authTicket)
		{
			console.error("LibreLink Up - No AuthTicket received. Please check your credentials.");
			deleteAuthTicket();
			return;
		}
		updateAuthTicket(authTicket);
	}

	const glucoseGraphData: GraphData | null = await getGlucoseMeasurements();

    if (!glucoseGraphData)
    {
        return;
    }

	console.log("glucoseGraphData: " + JSON.stringify(glucoseGraphData.connection.glucoseMeasurement));
}

function hasValidAuthentication(): boolean
{
    if (authTicket.expires !== undefined)
    {
        const currentDate = Math.round(new Date().getTime() / 1000);
        return currentDate < authTicket.expires;
    }

	console.log("no authTicket.expires");

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
    let config = readConfig()
    
    try
    {
        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/auth/login"
        const response: { data: LoginResponse } = await axios.post(
            url,
            {
                email: config.linkUpUsername,
                password: config.linkUpPassword,
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
				console.error(`LibreLink Up - Non-zero status code: ${JSON.stringify(response.data)}`)
                return null;
            }
            if (response.data.data.redirect === true && response.data.data.region)
            {
                const correctRegion = response.data.data.region.toUpperCase();
				console.error(`LibreLink Up - Logged in to the wrong region. Switch to '${correctRegion}' region.`);
                return null;
            }
			console.info("Logged in to LibreLink Up");
            return response.data.data.authTicket;
        } catch (err)
        {
			console.error("Invalid authentication token. Please check your LibreLink Up credentials", err);
            return null;
        }
    } catch (error)
    {
		console.error("Invalid credentials", error);
        return null;
    }
}

export async function getGlucoseMeasurements(): Promise<GraphData | null>
{
    let config = readConfig()

    try
    {
        const connectionId = await getLibreLinkUpConnection();
        if (!connectionId)
        {
            return null;
        }

        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/connections/" + connectionId + "/graph"
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
		console.error("Error getting glucose measurements", error);
        deleteAuthTicket();
        return null;
    }
}

export async function getLibreLinkUpConnection(): Promise<string | null>
{
    let config = readConfig()

    try
    {
        const url = "https://" + LIBRE_LINK_UP_URL + "/llu/connections"
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
			console.error("No LibreLink Up connection found");
            return null;
        }

        if (connectionData.length === 1)
        {
			console.info("Found 1 LibreLink Up connection.");
            logPickedUpConnection(connectionData[0]);
            return connectionData[0].patientId;
        }

        dumpConnectionData(connectionData);

        if (!config.linkUpConnection)
        {
			console.warn("You did not specify a Patient-ID in the LINK_UP_CONNECTION environment variable.");
            logPickedUpConnection(connectionData[0]);
            return connectionData[0].patientId;
        }

        const connection = connectionData.filter(connectionEntry => connectionEntry.patientId === config.linkUpConnection)[0];

        if (!connection)
        {
			console.error("The specified Patient-ID was not found.");
            return null;
        }

        logPickedUpConnection(connection);
        return connection.patientId;
    } catch (error)
    {
		console.error("getting libreLinkUpConnection: ", error);
        deleteAuthTicket();
        return null;
    }
}

function getLluAuthHeaders(): LibreLinkUpHttpHeaders
{
    const authenticatedHttpHeaders = libreLinkUpHttpHeaders;
    authenticatedHttpHeaders.Authorization = "Bearer " + getAuthenticationToken();
	console.debug("authenticatedHttpHeaders: " + JSON.stringify(authenticatedHttpHeaders));;
    return authenticatedHttpHeaders;
}

function getAuthenticationToken(): string | null
{
    if (authTicket.token)
    {
        return authTicket.token;
    }

	console.warn("no authTicket.token");

    return null;
}

function logPickedUpConnection(connection: Connection): void
{
    console.info(
        "-> The following connection will be used: " + connection.firstName + " " + connection.lastName + " (Patient-ID: " +
        connection.patientId + ")");
}

function dumpConnectionData(connectionData: Connection[]): void
{
    console.debug("Found " + connectionData.length + " LibreLink Up connections:");
    connectionData.map((connectionEntry: Connection, index: number) =>
    {
        console.debug("[" + (index + 1) + "] " + connectionEntry.firstName + " " + connectionEntry.lastName + " (Patient-ID: " +
            connectionEntry.patientId + ")");
    });
}

function readConfig(): linkUpConfig
{
	return {
		linkUpUsername: "",
		linkUpPassword: "",
		linkUpRegion: "CA",
		linkUpTimeInterval: 5,
		linkUpConnection: ""
	};
}