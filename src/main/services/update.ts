import { app } from 'electron';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

interface GithubRelease {
  tag_name: string;
  assets: Array<{
    browser_download_url: string;
    name: string;
  }>;
}

export class UpdateService {
  private isCheckingForUpdate = false;
  private downloadedUpdatePath: string | null = null;
  private tempDir: string | null = null;

  private readonly APP_PATH = "/Applications/Daily.app";
  private readonly BACKUP_PATH = "/Applications/Daily.app.backup";

  async checkForUpdates(): Promise<{ hasUpdate: boolean; version: string | null }> {
    if (this.isCheckingForUpdate) {
      return { hasUpdate: false, version: null };
    }

    try {
      this.isCheckingForUpdate = true;

      const currentVersion = await this.getCurrentVersion();
      
      const response = await fetch('https://api.github.com/repos/scheron/Daily/releases/latest');
      const release: GithubRelease = await response.json() as GithubRelease;
      const latestVersion = release.tag_name.replace('v', '');

      console.log({
        currentVersion,
        latestVersion,
      })

      if (!currentVersion || latestVersion > currentVersion) {
        return { hasUpdate: true, version: latestVersion };
      }

      return { hasUpdate: false, version: null };
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return { hasUpdate: false, version: null };
    } finally {
      this.isCheckingForUpdate = false;
    }
  }

  private async getCurrentVersion(): Promise<string | null> {
    try {
      if (!fs.existsSync(`${this.APP_PATH}/Contents/Info.plist`)) {
        return null;
      }
      const { stdout } = await execAsync(`defaults read "${this.APP_PATH}/Contents/Info.plist" CFBundleShortVersionString`);
      return stdout.trim();
    } catch (error) {
      console.error('Failed to get current version:', error);
      return null;
    }
  }

  async downloadUpdate(): Promise<boolean> {
    try {
      const response = await fetch('https://api.github.com/repos/scheron/Daily/releases/latest');
      const release: GithubRelease = await response.json() as GithubRelease;
      
      const macAsset = release.assets.find(asset => asset.name.endsWith('mac.dmg'));
      if (!macAsset) {
        throw new Error('Mac DMG not found in release assets');
      }

      this.tempDir = await fs.mkdtemp(path.join(tmpdir(), 'daily-update-'));
      this.downloadedUpdatePath = path.join(this.tempDir, 'daily.dmg');

      const dmgResponse = await fetch(macAsset.browser_download_url);
      if (!dmgResponse.ok) throw new Error('Failed to download DMG');
      
      const fileStream = fs.createWriteStream(this.downloadedUpdatePath);
      await new Promise<void>((resolve, reject) => {
        dmgResponse.body?.pipe(fileStream);
        fileStream.on('finish', () => resolve());
        fileStream.on('error', reject);
      });

      const stats = await fs.stat(this.downloadedUpdatePath);
      if (!stats.size) {
        throw new Error('Downloaded file is empty');
      }

      return true;
    } catch (error) {
      console.error('Failed to download update:', error);
      await this.cleanup();
      return false;
    }
  }

  async installUpdate(): Promise<boolean> {
    if (!this.downloadedUpdatePath || !this.tempDir) {
      return false;
    }

    try {
      const isRunning = await this.isAppRunning();

      if (isRunning) {
        app.quit();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (fs.existsSync(this.APP_PATH)) {
        if (fs.existsSync(this.BACKUP_PATH)) {
          await fs.remove(this.BACKUP_PATH);
        }
        await fs.copy(this.APP_PATH, this.BACKUP_PATH);
      }

      const { stdout: mountPath } = await execAsync(`hdiutil attach "${this.downloadedUpdatePath}" | grep "/Volumes/" | cut -f 3-`);
      const dmgMount = mountPath.trim();

      if (!dmgMount) {
        throw new Error('Failed to mount DMG');
      }

      await fs.remove(this.APP_PATH);
      await fs.copy(`${dmgMount}/Daily.app`, this.APP_PATH);

      await execAsync(`xattr -rd com.apple.quarantine "${this.APP_PATH}"`);

      await execAsync(`hdiutil detach "${dmgMount}"`);

      await this.cleanup();

      if (fs.existsSync(this.BACKUP_PATH)) {
        await fs.remove(this.BACKUP_PATH);
      }

      await execAsync(`open "${this.APP_PATH}"`);

      return true;
    } catch (error) {
      console.error('Failed to install update:', error);
      
      if (fs.existsSync(this.BACKUP_PATH)) {
        await fs.remove(this.APP_PATH);
        await fs.copy(this.BACKUP_PATH, this.APP_PATH);
      }
      
      await this.cleanup();
      return false;
    }
  }

  private async isAppRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('pgrep -fx "/Applications/Daily.app/Contents/MacOS/Daily"');
      return !!stdout.trim();
    } catch {
      return false;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.tempDir) {
        await fs.remove(this.tempDir);
        this.tempDir = null;
        this.downloadedUpdatePath = null;
      }
    } catch (error) {
      console.error('Failed to cleanup:', error);
    }
  }
}

export const updateService = new UpdateService(); 