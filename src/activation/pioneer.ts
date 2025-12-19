import * as vscode from "vscode";
import { PioneerAuth } from "../pioneer/PioneerAuth";
import { PioneerGatekeeper } from "../pioneer/PioneerGatekeeper";
import { PioneerSocket } from "../pioneer/PioneerSocket";
import { PointsTracker } from "../pioneer/PointsTracker";
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

	// Register resources
	context.subscriptions.push(statusItem);
	context.subscriptions.push(pioneerSocket);

	// Set up WebSocket event handlers
	pioneerSocket.onConnected((data) => {
		logger.info("Pioneer WebSocket connected", data);
	});

	pioneerSocket.onPointsUpdated((data) => {
		logger.info("Points updated via WebSocket", data);
		// Refresh profile to update UI
		auth.invalidateCache();
		auth.getProfile().then((profile) => {
			gatekeeper.setProfile(profile);
		});
	});

	pioneerSocket.onTierChanged((data) => {
		logger.info("Tier changed via WebSocket", data);
		// Show celebration notification
		const tierEmojis: Record<string, string> = {
			seedling: "🌱",
			grower: "🌿",
			cultivator: "🌳",
			guardian: "🌲",
		};
		const emoji = tierEmojis[data.to] || "🎉";
		vscode.window
			.showInformationMessage(
				`${emoji} Congratulations! You've reached ${data.to.charAt(0).toUpperCase() + data.to.slice(1)} tier!`,
				"View Benefits",
			)
			.then((selection) => {
				if (selection === "View Benefits") {
					// Open pioneer dashboard in browser
					vscode.env.openExternal(vscode.Uri.parse("https://snapback.dev/pioneer"));
				}
			});

		// Refresh profile
		auth.invalidateCache();
		auth.getProfile().then((profile) => {
			gatekeeper.setProfile(profile);
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
	auth.getSessionToken().then((token) => {
		if (token) {
			pioneerSocket.connect().catch((e) => {
				logger.warn("WebSocket connection failed on activation", { error: e });
			});
		}
	});

	return {
		auth,
		gatekeeper,
		pointsTracker,
		pioneerSocket,
	};
}
