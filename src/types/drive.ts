export interface GoogleAuthStatus {
  configured: boolean;
  authenticated: boolean;
  secureStorageAvailable: boolean;
  credentialSource: "environment";
}

export interface OAuthLoginResult {
  authenticated: boolean;
  expiresAtUnix: number;
}

export interface DriveUser {
  displayName: string;
  emailAddress: string;
  photoLink?: string;
}

export interface DriveStorageQuota {
  limit?: string;
  usage: string;
  usageInDrive?: string;
  usageInDriveTrash?: string;
}

export interface DriveConnection {
  user: DriveUser;
  storageQuota: DriveStorageQuota;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  parents: string[];
  webViewLink?: string;
  shared: boolean;
  trashed: boolean;
  capabilities?: {
    canDownload?: boolean;
  };
}

export interface DriveFilePage {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface DriveWebViewLink {
  fileId: string;
  webViewLink?: string;
}
