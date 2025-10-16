const axios = require('axios');

class GmailApi {
  constructor(apiKey = '33b5fc1663msha9ab0128c5449e7p13f98bjsnc0b11b98db57') {
    this.baseUrl = 'https://temporary-gmail-account.p.rapidapi.com';
    this.apiKey = apiKey;
    this.headers = {
      'Content-Type': 'application/json',
      'x-rapidapi-host': 'temporary-gmail-account.p.rapidapi.com',
      'x-rapidapi-key': this.apiKey
    };
    console.log('GmailApi initialized with base URL:', this.baseUrl);
  }

  async getAccount({ generateNewAccount = 0, ...rest } = {}) {
    console.log('Starting getAccount with params:', { generateNewAccount, ...rest });
    try {
      const response = await axios.post(
        `${this.baseUrl}/GmailGetAccount`,
        { generateNewAccount, ...rest },
        { headers: this.headers }
      );
      console.log('getAccount response received:', response?.data);
      return response?.data || {};
    } catch (error) {
      console.error('getAccount error:', error?.response?.data || error.message);
      throw error;
    }
  }

  async getMessages({ address, token, ...rest } = {}) {
    console.log('Starting getMessages with params:', { address, token, ...rest });
    try {
      const response = await axios.post(
        `${this.baseUrl}/GmailGetMessages`,
        { address, token, ...rest },
        { headers: this.headers }
      );
      console.log('getMessages response received:', response?.data);
      return response?.data || {};
    } catch (error) {
      console.error('getMessages error:', error?.response?.data || error.message);
      throw error;
    }
  }

  async getMessage({ messageId, address, token, ...rest } = {}) {
    console.log('Starting getMessage with params:', { messageId, address, token, ...rest });
    try {
      const response = await axios.post(
        `${this.baseUrl}/GmailGetMessage`,
        { messageId, address, token, ...rest },
        { headers: this.headers }
      );
      console.log('getMessage response received:', response?.data);
      return response?.data || {};
    } catch (error) {
      console.error('getMessage error:', error?.response?.data || error.message);
      throw error;
    }
  }

  async downloadAttachment({ fileName, messageId, address, token, ...rest } = {}) {
    console.log('Starting downloadAttachment with params:', { fileName, messageId, address, token, ...rest });
    try {
      const response = await axios.post(
        `${this.baseUrl}/GmailAttachmentDownload`,
        { fileName, messageId, address, token, ...rest },
        { headers: this.headers }
      );
      console.log('downloadAttachment response received:', response?.data);
      return response?.data || {};
    } catch (error) {
      console.error('downloadAttachment error:', error?.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = GmailApi;