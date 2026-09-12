# UNO আড্ডা — 24/7 cloud deployment

After cloud deployment, your Windows PC can be completely off. Friends use the public HTTPS URL instead of your LAN IP.

## Easiest: Render always-on

This project includes `render.yaml` configured for Render's paid Starter web-service compute so it does not use the sleeping Free service.

1. Create a GitHub repository and upload the contents of this `uno-duel` folder. `package.json` must be at the repository root.
2. Sign in to Render and choose **New → Blueprint**.
3. Connect the GitHub repository. Render detects `render.yaml`.
4. Confirm the paid Starter compute plan and deploy.
5. Render gives you an HTTPS URL such as `https://your-name.onrender.com`. Share that URL with anyone.

No `npm start`, no LAN IP, and your PC does not need to stay on.

> Rooms, scores and chat are currently stored in memory. A cloud restart or redeploy clears active rooms. Persistent accounts/history would require a database in a future version.

## Solo bot mode

Open the site, enter your name and avatar, then press **🤖 বট মামার সাথে এখনই খেলি**. A funny Bangla bot joins immediately and the match starts automatically. The bot plays legal cards, draws, picks Wild colors, calls/catches UNO, rematches, and sends taunts.
