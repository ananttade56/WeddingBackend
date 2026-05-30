// ==============================
// IMPORT REQUIRED PACKAGES
// ==============================
const express = require("express");
const app = express();
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

app.use(cors());
app.use(express.json());

// ==============================
// DYNAMIC DATABASE (TEMP MEMORY)
// ==============================
const allowedUsersFile = path.join(__dirname, "allowedUsers.txt");
const requestUsersFile = path.join(__dirname, "requestUsers.txt");
const blockedFingerprintsFile = path.join(__dirname, "blockedFingerprints.txt");
const activityLogsFile = path.join(__dirname, "activityLogs.txt");

const createFileIfNotExists = (filePath, defaultData) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
};

createFileIfNotExists(allowedUsersFile, []);
createFileIfNotExists(requestUsersFile, []);
createFileIfNotExists(blockedFingerprintsFile, []);
createFileIfNotExists(activityLogsFile, []);

const readData = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8"));
const writeData = (filePath, data) => fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

let allowedUsers = readData(allowedUsersFile);
let requestUsers = readData(requestUsersFile);
let blockedFingerprints = readData(blockedFingerprintsFile);
let activityLogs = readData(activityLogsFile);

// ==============================
// HELPER FUNCTIONS
// ==============================
const getUserIP = (req) => {
    return req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip;
};

// ==============================
// TELEGRAM FUNCTION
// ==============================
const BOT_TOKEN = "8639044397:AAFNUN4hXXAXJRMae-brZQhptCfCvLoDXVU";
const CHAT_ID = "682640171";

async function sendTelegramMessage(message) {
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        await axios.post(url, { chat_id: CHAT_ID, text: message });
        console.log("Telegram Message Sent");
    } catch (error) {
        console.log("Telegram Error", error.message);
    }
}

// ==============================
// ROOT API (Login/Access Check)
// ==============================
app.get("/", (req, res) => {
    const ipAddress = getUserIP(req);
    const name = req.query.name;
    const visitorId = req.query.visitorId;

    if (!visitorId) {
        return res.status(400).json({ success: false, message: "Device fingerprint missing" });
    }

    if (blockedFingerprints.includes(visitorId)) {
        return res.status(403).json({ success: false, message: "Your device is permanently blocked" });
    }

    // ADMIN CHECK
    if (name === "anantade56") {
        activityLogs.push({ name: "Admin (anantade56)", ipAddress, visitorId, loginTime: new Date() });
        writeData(activityLogsFile, activityLogs);
        return res.json({ success: true, message: "Welcome Admin", isAdmin: true });
    }

    // NORMAL USER CHECK (Strictly by Visitor ID)
    const user = allowedUsers.find((item) => {
        // Check if the user exists and if their fingerprints array includes this device
        return item.name === name && Array.isArray(item.fingerprints) && item.fingerprints.includes(visitorId);
    });

    if (!user) {
        return res.status(401).json({
            success: false,
            message: "Access Denied. Your device is not registered.",
        });
    }

    // Tracking: Save the IP address to the user's file (but don't use it for login)
    if (!Array.isArray(user.ips)) user.ips = [];
    if (!user.ips.includes(ipAddress)) {
        user.ips.push(ipAddress);
        writeData(allowedUsersFile, allowedUsers); // Update txt file with new IP
    }

    // Store activity log
    activityLogs.push({ name, ipAddress, visitorId, loginTime: new Date() });
    writeData(activityLogsFile, activityLogs);

    sendTelegramMessage(`User Accessed Website\nName: ${name}\nDevice ID: ${visitorId}\nIP: ${ipAddress}`);

    res.json({ success: true, message: "Welcome to Website", isAdmin: false });
});

// ==============================
// REQUEST ACCESS API
// ==============================
app.post("/request/user", (req, res) => {
    const { name, visitorId } = req.body;
    const ipAddress = getUserIP(req);

    if (!visitorId) return res.status(400).json({ success: false, message: "Device fingerprint missing" });

    // Prevent device sharing
    const deviceAlreadyUsed = allowedUsers.find(
        (user) => Array.isArray(user.fingerprints) && user.fingerprints.includes(visitorId)
    );
    if (deviceAlreadyUsed && deviceAlreadyUsed.name !== name) {
        return res.status(400).json({ success: false, message: `This Device already belongs to ${deviceAlreadyUsed.name}` });
    }

    if (blockedFingerprints.includes(visitorId)) {
        return res.status(403).json({ success: false, message: "Your device is blocked permanently" });
    }

    let existingUser = requestUsers.find((item) => item.name === name);

    // First time user
    if (!existingUser) {
        requestUsers.push({
            name,
            fingerprints: [visitorId],
            ips: [ipAddress], // Store IP for tracking
            status: "PENDING",
        });
        writeData(requestUsersFile, requestUsers);
        sendTelegramMessage(`New Access Request\nName: ${name}\nDevice ID: ${visitorId}\nIP: ${ipAddress}`);
        return res.json({ success: true, message: "Access request sent to admin" });
    }

    // Fix arrays if legacy data exists
    if (!Array.isArray(existingUser.fingerprints)) existingUser.fingerprints = [];
    if (!Array.isArray(existingUser.ips)) existingUser.ips = [];

    // Max 2 Devices Check
    if (existingUser.fingerprints.length >= 2 && !existingUser.fingerprints.includes(visitorId)) {
        return res.status(400).json({ success: false, message: "Maximum 2 Devices allowed" });
    }

    // Add new Device & IP
    if (!existingUser.fingerprints.includes(visitorId)) existingUser.fingerprints.push(visitorId);
    if (!existingUser.ips.includes(ipAddress)) existingUser.ips.push(ipAddress);
    
    writeData(requestUsersFile, requestUsers);
    sendTelegramMessage(`New Device Request\nName: ${name}\nDevice ID: ${visitorId}\nIP: ${ipAddress}`);

    res.json({ success: true, message: "New device request sent to admin" });
});

// ==============================
// ADMIN VIEW PENDING REQUESTS
// ==============================
app.get("/admin/requests", (req, res) => {
    res.json({ success: true, data: requestUsers });
});

// ==============================
// ADMIN ALLOW USER
// ==============================

app.post("/admin/allow", (req, res) => {
    const { name, visitorId } = req.body;

    // Find the request to extract the IP address associated with this device
    const requestUser = requestUsers.find(
        (item) => item.name === name && Array.isArray(item.fingerprints) && item.fingerprints.includes(visitorId)
    );

    if (!requestUser) {
        return res.status(404).json({ success: false, message: "User device request not found" });
    }

    let allowedUser = allowedUsers.find((item) => item.name === name);

    // Get the IP from the request (default to unknown if missing)
    const trackedIp = Array.isArray(requestUser.ips) ? requestUser.ips[0] : "Unknown";

    // New User Approval
    if (!allowedUser) {
        allowedUsers.push({ 
            name, 
            fingerprints: [visitorId],
            ips: [trackedIp] // Save IP for tracking
        });
        writeData(allowedUsersFile, allowedUsers);
    } else {
        // Fix legacy arrays
        if (!Array.isArray(allowedUser.fingerprints)) allowedUser.fingerprints = [];
        if (!Array.isArray(allowedUser.ips)) allowedUser.ips = [];

        // Max 2 Devices
        if (allowedUser.fingerprints.length >= 2 && !allowedUser.fingerprints.includes(visitorId)) {
            return res.status(400).json({ success: false, message: "Maximum 2 Devices allowed" });
        }

        // Add ID and IP to existing user
        if (!allowedUser.fingerprints.includes(visitorId)) allowedUser.fingerprints.push(visitorId);
        if (!allowedUser.ips.includes(trackedIp)) allowedUser.ips.push(trackedIp);
        
        writeData(allowedUsersFile, allowedUsers);
    }

    // Remove from request list
    requestUsers = requestUsers.filter(
        (item) => !(item.name === name && item.fingerprints.includes(visitorId))
    );
    writeData(requestUsersFile, requestUsers);

    sendTelegramMessage(`Admin Allowed User\nName: ${name}\nDevice ID: ${visitorId}`);

    res.json({ success: true, message: "User Allowed Successfully" });
});

// ==============================
// ADMIN REJECT USER
// ==============================
app.post("/admin/reject", (req, res) => {
    const { name, visitorId } = req.body;

    const index = requestUsers.findIndex(
        (item) => item.name === name && item.fingerprints.includes(visitorId)
    );

    if (index === -1) {
        return res.status(404).json({ success: false, message: "Request not found" });
    }

    requestUsers.splice(index, 1);
    writeData(requestUsersFile, requestUsers);

    sendTelegramMessage(`Admin Rejected User\nName: ${name}\nDevice ID: ${visitorId}`);

    res.json({ success: true, message: "User Rejected" });
});

// ==============================
// BLOCK DEVICE PERMANENTLY
// ==============================
app.post("/admin/block-device", (req, res) => {
    const { visitorId } = req.body;

    if (!blockedFingerprints.includes(visitorId)) {
        blockedFingerprints.push(visitorId);
        writeData(blockedFingerprintsFile, blockedFingerprints);
    }

    sendTelegramMessage(`Blocked Device Permanently\nDevice ID: ${visitorId}`);

    res.json({ success: true, message: "Device Blocked Successfully" });
});

// ==============================
// USER LOGOUT / TRACK TIME
// ==============================
app.post("/logout", (req, res) => {
    const { name, visitorId } = req.body;

    const userLog = activityLogs.find(
        (item) => item.name === name && item.visitorId === visitorId && !item.logoutTime
    );

    if (!userLog) {
        return res.status(404).json({ success: false, message: "User activity not found" });
    }

    userLog.logoutTime = new Date();
    const totalTime = (userLog.logoutTime - new Date(userLog.loginTime)) / 1000;
    userLog.totalTimeInSeconds = totalTime;
    
    writeData(activityLogsFile, activityLogs);
    sendTelegramMessage(`User Logout\nName: ${name}\nTime Spent: ${totalTime} sec`);

    res.json({ success: true, message: "Logout Successful", totalTimeInSeconds: totalTime });
});

// ==============================
// ADMIN VIEW LOGS
// ==============================
app.get("/admin/logs", (req, res) => {
    res.json({ success: true, data: activityLogs });
});

// ==============================
// SERVER
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on PORT ${PORT}`);
});