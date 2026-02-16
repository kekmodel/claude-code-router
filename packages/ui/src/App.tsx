import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Transformers } from "@/components/Transformers";
import { Providers } from "@/components/Providers";
import { Router } from "@/components/Router";
import { JsonEditor } from "@/components/JsonEditor";
import { LogViewer } from "@/components/LogViewer";
import { Button } from "@/components/ui/button";
import { useConfig } from "@/components/ConfigProvider";
import { api } from "@/lib/api";
import { Settings, Languages, Save, RefreshCw, FileJson, CircleArrowUp, FileText, FileCog, KeyRound } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import "@/styles/animations.css";

function App() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { config, error } = useConfig();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isJsonEditorOpen, setIsJsonEditorOpen] = useState(false);
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  // 版本检查状态
  const [isNewVersionAvailable, setIsNewVersionAvailable] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [newVersionInfo, setNewVersionInfo] = useState<{ version: string; changelog: string } | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [hasCheckedUpdate, setHasCheckedUpdate] = useState(false);
  const [isUpdateFeatureAvailable, setIsUpdateFeatureAvailable] = useState(true);
  const hasAutoCheckedUpdate = useRef(false);
  const headerIconButtonClass = "transition-all-ease hover:scale-110";

  const showOperationResult = (
    response: unknown,
    successMessage: string,
    failedMessage: string
  ): boolean => {
    if (response && typeof response === 'object' && 'success' in response) {
      const apiResponse = response as { success: boolean; message?: string };
      if (apiResponse.success) {
        setToast({ message: apiResponse.message || successMessage, type: 'success' });
        return true;
      }
      setToast({ message: apiResponse.message || failedMessage, type: 'error' });
      return false;
    }
    setToast({ message: successMessage, type: 'success' });
    return true;
  };

  const saveCurrentConfig = async (): Promise<boolean> => {
    if (!config) {
      setToast({ message: t('app.config_missing'), type: 'error' });
      return false;
    }

    const response = await api.updateConfig(config);
    return showOperationResult(
      response,
      t('app.config_saved_success'),
      t('app.config_saved_failed')
    );
  };

  const saveConfig = async () => {
    try {
      await saveCurrentConfig();
    } catch (error) {
      console.error('Failed to save config:', error);
      setToast({ message: t('app.config_saved_failed') + ': ' + (error as Error).message, type: 'error' });
    }
  };

  const saveConfigAndRestart = async () => {
    try {
      const saveSuccessful = await saveCurrentConfig();
      if (!saveSuccessful) {
        return;
      }

      const response = await api.restartService();
      showOperationResult(
        response,
        t('app.config_saved_restart_success'),
        t('app.config_saved_restart_failed')
      );
    } catch (error) {
      console.error('Failed to save config and restart:', error);
      setToast({ message: t('app.config_saved_restart_failed') + ': ' + (error as Error).message, type: 'error' });
    }
  };

  // 检查更新函数
  const checkForUpdates = useCallback(async (showDialog: boolean = true) => {
    // 如果已经检查过且有新版本，根据参数决定是否显示对话框
    if (hasCheckedUpdate && isNewVersionAvailable) {
      if (showDialog) {
        setIsUpdateDialogOpen(true);
      }
      return;
    }
    
    setIsCheckingUpdate(true);
    try {
      const updateInfo = await api.checkForUpdates();
      
      if (updateInfo.hasUpdate && updateInfo.latestVersion && updateInfo.changelog) {
        setIsNewVersionAvailable(true);
        setNewVersionInfo({
          version: updateInfo.latestVersion,
          changelog: updateInfo.changelog
        });
        // 只有在showDialog为true时才显示对话框
        if (showDialog) {
          setIsUpdateDialogOpen(true);
        }
      } else if (showDialog) {
        // 只有在showDialog为true时才显示没有更新的提示
        setToast({ message: t('app.no_updates_available'), type: 'success' });
      }
      
      setHasCheckedUpdate(true);
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setIsUpdateFeatureAvailable(false);
      if (showDialog) {
        setToast({ message: t('app.update_check_failed') + ': ' + (error as Error).message, type: 'error' });
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [hasCheckedUpdate, isNewVersionAvailable, t]);

  const triggerAutoUpdateCheck = useCallback(() => {
    if (!hasCheckedUpdate && !hasAutoCheckedUpdate.current) {
      hasAutoCheckedUpdate.current = true;
      checkForUpdates(false);
    }
  }, [hasCheckedUpdate, checkForUpdates]);

  const renderHeaderIconButton = (
    icon: ReactNode,
    onClick: () => void,
    tooltip: string
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          className={headerIconButtonClass}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );

  const renderCenteredState = (message: string, tone: "muted" | "error" = "muted") => (
    <div className="h-screen bg-gray-50 font-sans flex items-center justify-center">
      <div className={tone === "error" ? "text-red-500" : "text-gray-500"}>
        {message}
      </div>
    </div>
  );

  useEffect(() => {
    const checkAuth = async () => {
      // If we already have a config, we're authenticated
      if (config) {
        setIsCheckingAuth(false);
        triggerAutoUpdateCheck();
        return;
      }
      
      // For empty API key, allow access without checking config
      const apiKey = localStorage.getItem('apiKey');
      if (!apiKey) {
        setIsCheckingAuth(false);
        return;
      }
      
      // If we don't have a config, try to fetch it
      try {
        await api.getConfig();
        // If successful, we don't need to do anything special
        // The ConfigProvider will handle setting the config
      } catch (err) {
        // If it's a 401, the API client will redirect to login
        // For other errors, we still show the app to display the error
        console.error('Error checking auth:', err);
        // Redirect to login on authentication error
        if ((err as Error).message === 'Unauthorized') {
          navigate('/login');
        }
      } finally {
        setIsCheckingAuth(false);
        triggerAutoUpdateCheck();
      }
    };

    checkAuth();
    
    // Listen for unauthorized events
    const handleUnauthorized = () => {
      navigate('/login');
    };
    
    window.addEventListener('unauthorized', handleUnauthorized);
    
    return () => {
      window.removeEventListener('unauthorized', handleUnauthorized);
    };
  }, [config, navigate, triggerAutoUpdateCheck]);
  
  // 执行更新函数
  const performUpdate = async () => {
    if (!newVersionInfo) return;
    
    try {
      const result = await api.performUpdate();
      
      if (result.success) {
        setToast({ message: t('app.update_successful'), type: 'success' });
        setIsNewVersionAvailable(false);
        setIsUpdateDialogOpen(false);
        setHasCheckedUpdate(false); // 重置检查状态，以便下次重新检查
      } else {
        setToast({ message: t('app.update_failed') + ': ' + result.message, type: 'error' });
      }
    } catch (error) {
      console.error('Failed to perform update:', error);
      setToast({ message: t('app.update_failed') + ': ' + (error as Error).message, type: 'error' });
    }
  };

  
  if (isCheckingAuth) {
    return renderCenteredState("Loading application...");
  }

  if (error) {
    return renderCenteredState(`Error: ${error.message}`, "error");
  }

  // Handle case where config is null or undefined
  if (!config) {
    return renderCenteredState("Loading configuration...");
  }

  return (
    <TooltipProvider>
      <div className="h-screen bg-gray-50 font-sans">
      <header className="flex h-16 items-center justify-between border-b bg-white px-6">
        <h1 className="text-xl font-semibold text-gray-800">{t('app.title')}</h1>
        <div className="flex items-center gap-2">
          {renderHeaderIconButton(<Settings className="h-5 w-5" />, () => setIsSettingsOpen(true), t('app.settings'))}
          {renderHeaderIconButton(<FileJson className="h-5 w-5" />, () => setIsJsonEditorOpen(true), t('app.json_editor'))}
          {renderHeaderIconButton(<FileText className="h-5 w-5" />, () => setIsLogViewerOpen(true), t('app.log_viewer'))}
          {renderHeaderIconButton(<FileCog className="h-5 w-5" />, () => navigate('/presets'), t('app.presets'))}
          {renderHeaderIconButton(<KeyRound className="h-5 w-5" />, () => navigate('/oauth'), t('app.oauth'))}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="transition-all-ease hover:scale-110">
                <Languages className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-32 p-2">
              <div className="space-y-1">
                <Button
                  variant={i18n.language.startsWith('en') ? 'default' : 'ghost'}
                  className="w-full justify-start transition-all-ease hover:scale-[1.02]"
                  onClick={() => i18n.changeLanguage('en')}
                >
                  English
                </Button>
                <Button
                  variant={i18n.language.startsWith('zh') ? 'default' : 'ghost'}
                  className="w-full justify-start transition-all-ease hover:scale-[1.02]"
                  onClick={() => i18n.changeLanguage('zh')}
                >
                  中文
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          {/* 更新版本按钮 - 仅当更新功能可用时显示 */}
          {isUpdateFeatureAvailable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => checkForUpdates(true)}
                  disabled={isCheckingUpdate}
                  className="transition-all-ease hover:scale-110 relative"
                >
                  <div className="relative">
                    <CircleArrowUp className="h-5 w-5" />
                    {isNewVersionAvailable && !isCheckingUpdate && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>
                    )}
                  </div>
                  {isCheckingUpdate && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                    </div>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('app.check_updates')}</p>
              </TooltipContent>
            </Tooltip>
          )}
          <Button onClick={saveConfig} variant="outline" className="transition-all-ease hover:scale-[1.02] active:scale-[0.98]">
            <Save className="mr-2 h-4 w-4" />
            {t('app.save')}
          </Button>
          <Button onClick={saveConfigAndRestart} className="transition-all-ease hover:scale-[1.02] active:scale-[0.98]">
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('app.save_and_restart')}
          </Button>
        </div>
      </header>
      <main className="flex h-[calc(100vh-4rem)] gap-4 p-4 overflow-hidden">
        <div className="w-3/5">
          <Providers />
        </div>
        <div className="flex w-2/5 flex-col gap-4">
          <div className="h-3/5">
            <Router />
          </div>
          <div className="flex-1 overflow-hidden">
            <Transformers />
          </div>
        </div>
      </main>
      <SettingsDialog isOpen={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      <JsonEditor 
        open={isJsonEditorOpen} 
        onOpenChange={setIsJsonEditorOpen} 
        showToast={(message, type) => setToast({ message, type })} 
      />
      <LogViewer 
        open={isLogViewerOpen} 
        onOpenChange={setIsLogViewerOpen} 
        showToast={(message, type) => setToast({ message, type })} 
      />
      {/* 版本更新对话框 */}
      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('app.new_version_available')}
              {newVersionInfo && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  v{newVersionInfo.version}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {t('app.update_description')}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto py-4">
            {newVersionInfo?.changelog ? (
              <div className="whitespace-pre-wrap text-sm">
                {newVersionInfo.changelog}
              </div>
            ) : (
              <div className="text-muted-foreground">
                {t('app.no_changelog_available')}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsUpdateDialogOpen(false)}
            >
              {t('app.later')}
            </Button>
            <Button onClick={performUpdate}>
              {t('app.update_now')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
    </TooltipProvider>
  );
}

export default App;
