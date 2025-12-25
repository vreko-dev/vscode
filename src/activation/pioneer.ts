import * as vscode from "vscode";
import { PIONEER_DASHBOARD_URL } from "../constants";
import { PioneerAuth } from "../pioneer/PioneerAuth";
import { PioneerGatekeeper } from "../pioneer/PioneerGatekeeper";
import { PioneerSocket } from "../pioneer/PioneerSocket";
import { PointsTracker } from "../pioneer/PointsTracker";
import { isValidTier } from "../pioneer/types";
import { logger } from "../utils/logger";
import { PioneerStatusItem } from "../views/PioneerStatusItem";

export async function initializePioneerInfrastructure(context: vscode.ExtensionContext) {
	const auth = new PioneerAuth();
	const gatekeeper = PioneerGatekeeper.getInstance();
	const pointsTracker = new PointsTracker();
	const pioneerSocket = new PioneerSocket(auth);
	const statusItem = new PioneerStatusItem(context, gatekeeper);

	// Wire up dependencies
	auth.setContext(context);
	pointsTracker.setAuth(auth);
	pointsTracker.setContext(context); // P0 FIX #4: Enable offline queue persistence

	// Initial profile fetch (if session exists) - DEFERRED to not block activation
	// Per ROUTER.md performance pattern: fire-and-forget for network calls
	auth.getProfile()
		.then((profile) => {
			gatekeeper.setProfile(profile);
			logger.info("Pioneer profile loaded", {
				hasProfile: !!profile,
				tier: profile?.tier,
			});
		})
		.catch((e) => {
			const err = e instanceof Error ? e : new Error(String(e));
			logger.error("Failed to fetch initial profile", err);
		});

	// Register login command
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.pioneer.login", async () => {
			try {
				const session = await auth.login();
				if (session) {
					const profile = await auth.getProfile();
					gatekeeper.setProfile(profile);
					vscode.window.showInformationMessage(`Welcome back, Pioneer ${profile?.username || "User"}!`);

					// Sync points after login
					await pointsTracker.syncWithServer();
				}
			} catch (e) {
				vscode.window.showErrorMessage(`Login failed: ${e instanceof Error ? e.message : String(e)}`);
			}
		}),
	);

	// Register logout command
	context.subscriptions.push(
		vscode.commands.registerCommand("snapback.pioneer.logout", async () => {
			try {
				await auth.logout();
				gatekeeper.setProfile(null);
				vscode.window.showInformationMessage("Signed out of Pioneer Program");
			} catch (e) {
				const err = e instanceof Error ? e : new Error(String(e));
				logger.error("Logout failed", err);
			}
		}),
	);

	// Register all disposable resources
	context.subscriptions.push(statusItem);
	context.subscriptions.push(pioneerSocket);
	context.subscriptions.push(pointsTracker);
	context.subscriptions.push(gatekeeper);
	context.subscriptions.push(auth);

	// Set up WebSocket event handlers
	pioneerSocket.onConnected((data) => {
		logger.info("Pioneer WebSocket connected", data);
	});

	pioneerSocket.onPointsUpdated((data) => {
		logger.info("Points updated via WebSocket", data);
		// Refresh profile to update UI
		auth.invalidateCache();
		auth.getProfile()
			.then((profile) => {
				gatekeeper.setProfile(profile);
			})
			.catch((e) => {
				logger.warn("Failed to refresh profile after points update", { error: e });
			});
	});

	pioneerSocket.onTierChanged((data) => {
		logger.info("Tier changed via WebSocket", data);
		// Show celebration notification - use type guard for safety
		const tier = isValidTier(data.to) ? data.to : "seedling";
		const emoji = gatekeeper.getTierEmoji(tier);
		vscode.window
			.showInformationMessage(
				`${emoji} Congratulations! You've reached ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier!`,
				"View Benefits",
			)
			.then((selection) => {
				if (selection === "View Benefits") {
					// Open pioneer dashboard in browser
					vscode.env.openExternal(vscode.Uri.parse(PIONEER_DASHBOARD_URL));
				}
			});

		// Refresh profile
		auth.invalidateCache();
		auth.getProfile()
			.then((profile) => {
				gatekeeper.setProfile(profile);
			})
			.catch((e) => {
				logger.warn("Failed to refresh profile after tier change", { error: e });
			});
	});

	pioneerSocket.onReferralConverted((data) => {
		logger.info("Referral converted via WebSocket", data);
		vscode.window.showInformationMessage(
			`🎉 Your referral ${data.referralUsername} just activated! +${data.pointsEarned} points`,
		);
	});

	// Sync points on activation (non-blocking)
	pointsTracker.syncWithServer().catch((e) => {
		logger.warn("Points sync failed on activation", { error: e });
	});

	// Connect WebSocket if authenticated
	auth.getSessionToken()
		.then((token) => {
			if (token) {
				pioneerSocket.connect().catch((e) => {
					logger.warn("WebSocket connection failed on activation", { error: e });
				});
			}
		})
		.catch((e) => {
			logger.warn("Failed to get session token for WebSocket", { error: e });
		});

	return {
		auth,
		gatekeeper,
		pointsTracker,
		pioneerSocket,
	};
}
