import fetch from "node-fetch";
import crypto from "crypto";
import QRCode from "qrcode";
import prompts from "prompts";

export default async () => {
	const {token} = await prompts({
		type: "text",
		name: "token",
		message: "BOT token",
		validate: (token) => token !== "",
		onState: (state) => {
			// https://github.com/terkelg/prompts/issues/252
			if (state.aborted) {
				process.stdout.write("\x1B[?25h");
				process.stdout.write("\n");
				process.exit(1);
			}
		},
	});

	const sendTelegramCommand = async (url, params) => {
		const res = await fetch(`https://api.telegram.org/bot${token}/${url}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify(params),
		});
		if (!res.ok) {
			throw await res.json();
		}
		const result = await res.json();
		if (!result.ok) {
			throw result;
		}
		return result.result;
	};

	const username = (await sendTelegramCommand("getMe", {})).username;
	const startToken = crypto.randomBytes(16).toString("hex");

	const url = `https://t.me/${username}?start=${startToken}`;

	const qr = await QRCode.toString(url, {type:"terminal", small: true});
	console.log(url);
	console.log(qr);

	// get current webhook so that we can restore it
	const webhookInfo = await sendTelegramCommand("getWebhookInfo", {});
	try {
		await sendTelegramCommand("deleteWebhook", {});

		const checkMessages = async (offset) => {
			const messages = await sendTelegramCommand("getUpdates", {timeout: 10, offset});
			const startMessage = messages.find((message) => {
				return message.message.text === `/start ${startToken}`;
			});
			if (startMessage) {
				return startMessage.message.chat.id;
			}else {
				const maxUpdateId = Math.max(offset, ...messages.map(({update_id}) => update_id));
				return checkMessages(maxUpdateId + 1);
			}
		};
		const chatId = await checkMessages(0);
		console.log(`TOKEN: ${token}\nCHAT_ID: ${chatId}`);
		console.log(`curl -X POST -d 'chat_id=${chatId}' -d 'text=abc' -d 'disable_notification=true' https://api.telegram.org/bot${token}/sendMessage`);
	}finally {
		// if a webhook was previously set, restore it
		// no custom certificate or custom ip though
		if(webhookInfo.url) {
			await sendTelegramCommand("setWebhook", {url: webhookInfo.url, max_connections: webhookInfo.max_connections, allowed_updates: webhookInfo.allowed_updates});
		}
	}
};
