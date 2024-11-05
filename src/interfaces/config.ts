// Configuration for the extension
export interface linkUpConfig {
	linkUpRegion: string;
	linkUpUsername: string;
	linkUpPassword: string;
	linkUpConnection: string;
	glucoseUnits: string;
	lowGlucoseWarningEnabled: boolean;
	lowGlucoseWarningBackgroundEnabled: boolean;
	highGlucoseWarningEnabled: boolean;
	highGlucoseWarningBackgroundEnabled: boolean;
	updateInterval: number;
}