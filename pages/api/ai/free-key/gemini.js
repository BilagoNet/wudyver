import fetch from "node-fetch";
class RemoteConfig {
  constructor() {
    this.API_KEY = "AIzaSyAUNtfTBD5VeUi_uzzb5ERS73FPSkR5EA8";
    this.URL = "https://firebaseremoteconfig.googleapis.com/v1/projects/929029798693/namespaces/firebase:fetch";
    this.requestBody = {
      appId: "1:929029798693:android:e28c9b5479c0bd4a4738cc",
      appInstanceId: "x",
      appInstanceIdToken: "x",
      platformVersion: "33",
      packageName: "x",
      sdkVersion: "22.1.2"
    };
  }
  async getData() {
    try {
      const options = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.API_KEY
        },
        body: JSON.stringify(this.requestBody)
      };
      const response = await fetch(this.URL, options);
      if (!response.ok) {
        const errorDetails = await response.json().catch(() => ({
          message: "No JSON body"
        }));
        throw new Error(`HTTP Error! Status: ${response.status}. Details: ${JSON.stringify(errorDetails)}`);
      }
      const rawData = await response.json();
      console.log(Object.keys(rawData.entries));
      return this.processData(rawData.entries);
    } catch (error) {
      console.error("Error fetching Remote Config:", error.message);
      throw error;
    }
  }
  processData(rawConfig) {
    const processedKeys = {};
    for (const [key, value] of Object.entries(rawConfig)) {
      if (typeof value === "string" && value.includes("keys")) {
        try {
          const configObject = JSON.parse(value);
          if (configObject && typeof configObject === "object" && Array.isArray(configObject.keys) && configObject.keys.length > 0) {
            const providerName = key;
            if (!processedKeys[providerName]) {
              processedKeys[providerName] = [];
            }
            configObject.keys.forEach(k => {
              if (k && typeof k === "string" && k.trim() !== "" && !processedKeys[providerName].includes(k)) {
                processedKeys[providerName].push(k);
              }
            });
          }
        } catch (e) {
          console.warn(`Invalid JSON for key ${key}:`, e.message);
          continue;
        }
      }
    }
    return processedKeys;
  }
}
export default async function handler(req, res) {
  try {
    const api = new RemoteConfig();
    const result = await api.getData();
    return res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}