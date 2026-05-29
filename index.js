// ==============================
// IMPORT REQUIRED PACKAGES
// ==============================
const express = require("express");
const app = express();

const cors = require("cors");

app.use(cors());

app.use(express.json());

// ==============================
// DYNAMIC DATABASE (TEMP MEMORY)
// ==============================

// Dynamic Data From TXT Files

// ==============================
// FILE SYSTEM
// ==============================

const fs = require("fs");
const path = require("path");

// ==============================
// FILE PATHS
// ==============================

const allowedUsersFile = path.join(
    __dirname,
    "allowedUsers.txt"
);

const requestUsersFile = path.join(
    __dirname,
    "requestUsers.txt"
);

const blockedIPsFile = path.join(
    __dirname,
    "blockedIPs.txt"
);

const activityLogsFile = path.join(
    __dirname,
    "activityLogs.txt"
);

// ==============================
// CREATE FILE IF NOT EXISTS
// ==============================

const createFileIfNotExists = (filePath, defaultData) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(
            filePath,
            JSON.stringify(defaultData, null, 2)
        );
    }
};

createFileIfNotExists(allowedUsersFile, []);
createFileIfNotExists(requestUsersFile, []);
createFileIfNotExists(blockedIPsFile, []);
createFileIfNotExists(activityLogsFile, []);

// ==============================
// READ DATA FUNCTION
// ==============================

const readData = (filePath) => {
    const data = fs.readFileSync(filePath, "utf-8");

    return JSON.parse(data);
};

// ==============================
// WRITE DATA FUNCTION
// ==============================

const writeData = (filePath, data) => {
    fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2)
    );
};

let allowedUsers = readData(allowedUsersFile);

let requestUsers = readData(requestUsersFile);

let blockedIPs = readData(blockedIPsFile);

let activityLogs = readData(activityLogsFile);

// ==============================
// HELPER FUNCTION
// ==============================

// Get User IP
const getUserIP = (req) => {
    return (
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        req.ip
    );
};

// ==============================
// TELEGRAM FUNCTION
// ==============================

// Install axios first
// npm install axios

const axios = require("axios");

const BOT_TOKEN = "8639044397:AAFNUN4hXXAXJRMae-brZQhptCfCvLoDXVU";
const CHAT_ID = "682640171";

async function sendTelegramMessage(message) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
    });

    console.log("Telegram Message Sent");
  } catch (error) {
    console.log("Telegram Error", error.message);
  }
}

// ==============================
// ROOT API
// ==============================

app.get("/", (req, res) => {
    const ipAddress = getUserIP(req);
    const name = req.query.name;

    // Check blocked IP
    if (blockedIPs.includes(ipAddress)) {
        return res.status(403).json({
            success: false,
            message: "Your IP is permanently blocked by admin",
        });
    }

    // ==============================
    // ADMIN CHECK (Bypass normal flow)
    // ==============================
    if (name === "anantade56") {
        // Optional: Still store activity log for the admin
        activityLogs.push({
            name: "Admin (anantade56)",
            ipAddress,
            loginTime: new Date(),
        });
        writeData(activityLogsFile, activityLogs);

        // Send special admin flag to the frontend
        return res.json({
            success: true,
            message: "Welcome Admin",
            isAdmin: true 
        });
    }

    // ==============================
    // NORMAL USER CHECK
    // ==============================
    
    // Find User
    const user = allowedUsers.find(
        (item) =>
            item.name === name &&
            item.ipAddress.includes(ipAddress)
    );

    // If user not allowed
    if (!user) {
        return res.status(401).json({
            success: false,
            message: "Access Denied. Your name or IP Address is not allowed.",
        });
    }

    // Store activity log
    activityLogs.push({
        name,
        ipAddress,
        loginTime: new Date(),
    });

    writeData(activityLogsFile, activityLogs);

    // Telegram Alert
    sendTelegramMessage(
        `User Accessed Website\nName: ${name}\nIP: ${ipAddress}`
    );

    res.json({
        success: true,
        message: "Welcome to Website",
        isAdmin: false // Explicitly state they are not admin
    });
});

// ==============================
// REQUEST ACCESS API
// ==============================

app.post("/request/user", (req, res) => {
    const { name } = req.body;
    const ipAddress = getUserIP(req);

// ==============================
// CHECK IP ALREADY USED
// ==============================

const ipAlreadyUsed = allowedUsers.find((user) =>
  user.ipAddress.includes(ipAddress)
);

// If IP belongs to another user
if (ipAlreadyUsed && ipAlreadyUsed.name !== name) {
  return res.status(400).json({
    success: false,
    message: `This IP Address already belongs to ${ipAlreadyUsed.name}`,
  });
}

    // Check blocked IP
    if (blockedIPs.includes(ipAddress)) {
        return res.status(403).json({
            success: false,
            message: "Your IP is blocked permanently",
        });
    }

    // Check already allowed
    const alreadyAllowed = allowedUsers.find(
        (item) =>
            item.name === name &&
            item.ipAddress.includes(ipAddress)
    );

    if (alreadyAllowed) {
        return res.json({
            success: true,
            message: "You already have access",
        });
    }

    // Find Existing Request User
    let existingUser = requestUsers.find(
        (item) => item.name === name
    );

    // First time user
    if (!existingUser) {
        requestUsers.push({
            name,
            ipAddress: [ipAddress],
            status: "PENDING",
        });

        writeData(requestUsersFile, requestUsers);

        sendTelegramMessage(
          `New Access Request\nName: ${name}\nIP: ${ipAddress}`
        );

        return res.json({
            success: true,
            message: "Access request sent to admin",
        });
    }

    // Maximum 2 IPs allowed
    if (existingUser.ipAddress.length >= 2) {
        return res.status(400).json({
            success: false,
            message: "Maximum 2 IP Addresses allowed",
        });
    }

    // Add new IP if not exists
    if (!existingUser.ipAddress.includes(ipAddress)) {
        existingUser.ipAddress.push(ipAddress);
    }

    //   sendTelegramMessage(
    //     `New IP Request\nName: ${name}\nIP: ${ipAddress}`
    //   );

    res.json({
        success: true,
        message: "New IP request sent to admin",
    });
});

// ==============================
// ADMIN ALLOW USER
// ==============================

// ==============================
// ADMIN VIEW PENDING REQUESTS
// ==============================
app.get("/admin/requests", (req, res) => {
    // Send the pending requestUsers array to the frontend
    res.json({
        success: true,
        data: requestUsers,
    });
});
app.post("/admin/allow", (req, res) => {
  const { name, ipAddress } = req.body;

  // ==============================
  // CHECK IP ALREADY USED
  // ==============================

  const ipAlreadyUsed = allowedUsers.find((user) =>
    user.ipAddress.includes(ipAddress)
  );

  // If IP already belongs to another user
  if (ipAlreadyUsed && ipAlreadyUsed.name !== name) {
    return res.status(400).json({
      success: false,
      message: `This IP Address is already assigned to ${ipAlreadyUsed.name}`,
    });
  }

  // ==============================
  // FIND REQUEST USER
  // ==============================

  const requestUser = requestUsers.find(
    (item) =>
      item.name === name &&
      item.ipAddress.includes(ipAddress)
  );

  if (!requestUser) {
    return res.status(404).json({
      success: false,
      message: "User request not found",
    });
  }

  // ==============================
  // FIND ALLOWED USER
  // ==============================

  let allowedUser = allowedUsers.find(
    (item) => item.name === name
  );

  // New User
  if (!allowedUser) {
    allowedUsers.push({
      name,
      ipAddress: [ipAddress],
    });

    writeData(allowedUsersFile, allowedUsers);
  } else {
    // Max 2 IPs
    if (allowedUser.ipAddress.length >= 2) {
      return res.status(400).json({
        success: false,
        message: "Maximum 2 IP Addresses allowed",
      });
    }

    // Add IP if not exists
    if (!allowedUser.ipAddress.includes(ipAddress)) {
      allowedUser.ipAddress.push(ipAddress);

      writeData(allowedUsersFile, allowedUsers);
    }
  }

  // ==============================
  // REMOVE FROM REQUEST LIST
  // ==============================

  requestUsers = requestUsers.filter(
    (item) =>
      !(
        item.name === name &&
        item.ipAddress.includes(ipAddress)
      )
  );

  writeData(requestUsersFile, requestUsers);

  // ==============================
  // TELEGRAM MESSAGE
  // ==============================

//   sendTelegramMessage(
//     `Admin Allowed User\nName: ${name}\nIP: ${ipAddress}`
//   );

  // ==============================
  // RESPONSE
  // ==============================

  res.json({
    success: true,
    message: "User Allowed Successfully",
  });
});

// ==============================
// ADMIN REJECT USER
// ==============================

app.post("/admin/reject", (req, res) => {
    const { name, ipAddress } = req.body;

    const index = requestUsers.findIndex(
        (item) =>
            item.name === name &&
            item.ipAddress.includes(ipAddress)
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            message: "Request not found",
        });
    }

    // Removes the user from the array
    requestUsers.splice(index, 1);

    // ADD THIS LINE: Save the updated array back to the text file
    writeData(requestUsersFile, requestUsers);

      sendTelegramMessage(
        `Admin Rejected User\nName: ${name}\nIP: ${ipAddress}`
      );

    res.json({
        success: true,
        message: "User Rejected",
    });
});

// ==============================
// BLOCK IP PERMANENTLY
// ==============================

app.post("/admin/block-ip", (req, res) => {
    const { ipAddress } = req.body;

    if (!blockedIPs.includes(ipAddress)) {
        blockedIPs.push(ipAddress);

        writeData(blockedIPsFile, blockedIPs);
    }

      sendTelegramMessage(
        `Blocked IP Permanently\nIP: ${ipAddress}`
      );

    res.json({
        success: true,
        message: "IP Blocked Successfully",
    });
});

// ==============================
// USER LOGOUT / TRACK TIME
// ==============================

app.post("/logout", (req, res) => {
    const { name } = req.body;
    const ipAddress = getUserIP(req);

    const userLog = activityLogs.find(
        (item) =>
            item.name === name &&
            item.ipAddress === ipAddress &&
            !item.logoutTime
    );

    if (!userLog) {
        return res.status(404).json({
            success: false,
            message: "User activity not found",
        });
    }

    userLog.logoutTime = new Date();

    // Calculate total time
    const totalTime =
        (userLog.logoutTime - userLog.loginTime) / 1000;

    userLog.totalTimeInSeconds = totalTime;
    writeData(activityLogsFile, activityLogs);
      sendTelegramMessage(
        `User Logout\nName: ${name}\nTime Spent: ${totalTime} sec`
      );

    res.json({
        success: true,
        message: "Logout Successful",
        totalTimeInSeconds: totalTime,
    });
});

// ==============================
// ADMIN VIEW LOGS
// ==============================

app.get("/admin/logs", (req, res) => {
    res.json({
        success: true,
        data: activityLogs,
    });
});

// ==============================
// SERVER
// ==============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});