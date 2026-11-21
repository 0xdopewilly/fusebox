/** @FuseboxAlertsBot: a Telegram message for every payment a wallet's agent tries. The link follows one wallet. */
export const ALERTS_BOT = "FuseboxAlertsBot";
export const alertsLink = (wallet: string) => `https://t.me/${ALERTS_BOT}?start=w_${wallet.slice(2).toLowerCase()}`;
