/**
 * IndexedDB File Storage Utility
 * Handles efficient storage and retrieval of all file types (images, documents, etc.)
 */

const DB_NAME = 'chatgpt-clone-files';
const DB_VERSION = 1;
const STORE_NAME = 'files';

class FileStorage {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  /**
   * Initialize IndexedDB connection
   */
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create images store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          
          // Create indexes for efficient querying
          store.createIndex('conversationId', 'conversationId', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('size', 'size', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Store an image in IndexedDB
   * @param {string} id - Unique image identifier
   * @param {string} dataUrl - Base64 data URL
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<string>} Image ID
   */
  async storeImage(id, dataUrl, metadata = {}) {
    await this.init();

    // Extract mime type and size from data URL
    const [header] = dataUrl.split(',');
    const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
    const size = Math.round(dataUrl.length * 0.75); // Rough base64 to bytes conversion

    const imageRecord = {
      id,
      dataUrl,
      mimeType,
      size,
      createdAt: Date.now(),
      ...metadata
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(imageRecord);

      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieve an image from IndexedDB
   * @param {string} id - Image identifier
   * @returns {Promise<Object|null>} Image record with dataUrl
   */
  async getImage(id) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get image data URL for display/API use
   * @param {string} id - Image identifier
   * @returns {Promise<string|null>} Base64 data URL
   */
  async getImageDataUrl(id) {
    const record = await this.getImage(id);
    return record ? record.dataUrl : null;
  }

  /**
   * Delete an image from IndexedDB
   * @param {string} id - Image identifier
   * @returns {Promise<boolean>} Success status
   */
  async deleteImage(id) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all images for a conversation
   * @param {string} conversationId - Conversation identifier
   * @returns {Promise<Array>} Array of image records
   */
  async getConversationImages(conversationId) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('conversationId');
      const request = index.getAll(conversationId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all stored images (for cleanup/management)
   * @returns {Promise<Array>} Array of all image records
   */
  async getAllImages() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete all images for a conversation
   * @param {string} conversationId - Conversation identifier
   * @returns {Promise<number>} Number of deleted images
   */
  async deleteConversationImages(conversationId) {
    const images = await this.getConversationImages(conversationId);
    let deletedCount = 0;

    for (const image of images) {
      try {
        await this.deleteImage(image.id);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete image ${image.id}:`, error);
      }
    }

    return deletedCount;
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>} Storage stats
   */
  async getStorageStats() {
    const images = await this.getAllImages();
    
    const totalSize = images.reduce((sum, img) => sum + img.size, 0);
    const totalCount = images.length;
    
    const byConversation = images.reduce((acc, img) => {
      const convId = img.conversationId || 'unknown';
      acc[convId] = (acc[convId] || 0) + 1;
      return acc;
    }, {});

    return {
      totalSize,
      totalCount,
      averageSize: totalCount > 0 ? Math.round(totalSize / totalCount) : 0,
      conversationCounts: byConversation,
      formattedTotalSize: this.formatBytes(totalSize)
    };
  }

  /**
   * Clean up orphaned images (images not referenced in any conversation)
   * @param {Array} referencedImageIds - Array of image IDs still in use
   * @returns {Promise<number>} Number of cleaned up images
   */
  async cleanupOrphanedImages(referencedImageIds) {
    const allImages = await this.getAllImages();
    const referencedSet = new Set(referencedImageIds);
    let cleanedCount = 0;

    for (const image of allImages) {
      if (!referencedSet.has(image.id)) {
        try {
          await this.deleteImage(image.id);
          cleanedCount++;
          console.log(`Cleaned up orphaned image: ${image.id}`);
        } catch (error) {
          console.error(`Failed to cleanup image ${image.id}:`, error);
        }
      }
    }

    return cleanedCount;
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export singleton instance
export const fileStorage = new FileStorage();

// Convenience functions for all file types
export const storeFile = (id, dataUrl, metadata) => fileStorage.storeImage(id, dataUrl, metadata);
export const getFile = (id) => fileStorage.getImage(id);
export const getFileDataUrl = (id) => fileStorage.getImageDataUrl(id);
export const deleteFile = (id) => fileStorage.deleteImage(id);
export const getStorageStats = () => fileStorage.getStorageStats();
export const cleanupOrphanedFiles = (referencedIds) => fileStorage.cleanupOrphanedImages(referencedIds);