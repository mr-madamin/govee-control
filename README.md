# Govee Control

A desktop app for controlling Govee smart lights with custom colors and presets.

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Get a Govee API key**
   Open the Govee Home app → Profile → About Us → Apply for API key.

3. **Run the app**
   ```
   npm start
   ```
   On first launch you'll be prompted to enter your API key. It's stored locally on your machine and never in this repo.

## Features

- View all your Govee devices in a dashboard grid
- Pick a custom color per device and apply it instantly
- Save named color presets and apply them to all devices at once
- Update your API key at any time via the sidebar settings button

## Security

The API key is stored in Electron's `userData` directory (outside the project folder) and never exposed to the renderer process.