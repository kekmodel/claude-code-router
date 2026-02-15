import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, LogIn, LogOut, KeyRound, ExternalLink, Copy, Check } from "lucide-react";
import { Toast } from "@/components/ui/toast";
import type { OAuthProviderInfo, OAuthLoginResponse } from "@/types";

export function OAuthManagement() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [providers, setProviders] = useState<OAuthProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Login dialog state
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginProvider, setLoginProvider] = useState<string | null>(null);
  const [loginResponse, setLoginResponse] = useState<OAuthLoginResponse | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Logout confirmation dialog state
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutProvider, setLogoutProvider] = useState<string | null>(null);

  const handleGoBack = () => {
    navigate('/dashboard');
  };

  // Load OAuth providers
  const loadProviders = async () => {
    try {
      setLoading(true);
      const response = await api.getAuthProviders();
      setProviders(response.providers || []);
    } catch (error) {
      console.error('Failed to load OAuth providers:', error);
      setToast({ message: t('oauth.load_failed'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  // Start OAuth login
  const handleLogin = async (providerName: string) => {
    try {
      setIsLoggingIn(true);
      setLoginProvider(providerName);
      const response = await api.startAuthLogin(providerName);
      setLoginResponse(response);
      setLoginDialogOpen(true);
    } catch (error: any) {
      console.error('Failed to start OAuth login:', error);
      setToast({ message: t('oauth.login_failed', { error: error.message }), type: 'error' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Copy device code to clipboard
  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      setToast({ message: t('oauth.copy_failed'), type: 'warning' });
    }
  };

  // Start OAuth logout
  const handleLogoutConfirm = (providerName: string) => {
    setLogoutProvider(providerName);
    setLogoutDialogOpen(true);
  };

  const handleLogout = async () => {
    if (!logoutProvider) return;
    try {
      await api.authLogout(logoutProvider);
      setToast({ message: t('oauth.logout_success', { provider: logoutProvider }), type: 'success' });
      setLogoutDialogOpen(false);
      setLogoutProvider(null);
      await loadProviders();
    } catch (error: any) {
      console.error('Failed to logout:', error);
      setToast({ message: t('oauth.logout_failed', { error: error.message }), type: 'error' });
    }
  };

  // Close login dialog and refresh
  const handleLoginDialogClose = () => {
    setLoginDialogOpen(false);
    setLoginResponse(null);
    setLoginProvider(null);
    setCodeCopied(false);
    // Refresh providers to reflect new auth status
    loadProviders();
  };

  // Get status badge variant and label
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return { variant: 'default' as const, label: t('oauth.status_active'), className: 'bg-green-500 hover:bg-green-500/80' };
      case 'expired':
        return { variant: 'destructive' as const, label: t('oauth.status_expired'), className: '' };
      default:
        return { variant: 'secondary' as const, label: t('oauth.status_not_authenticated'), className: '' };
    }
  };

  // Format expiry time
  const formatExpiry = (expiresAt: number | null) => {
    if (!expiresAt) return null;
    const date = new Date(expiresAt);
    const now = new Date();
    if (date <= now) return t('oauth.expired');
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return t('oauth.expires_in_days', { days });
    }
    if (hours > 0) {
      return t('oauth.expires_in_hours', { hours, minutes });
    }
    return t('oauth.expires_in_minutes', { minutes });
  };

  // Get provider display info
  const getProviderInfo = (name: string) => {
    switch (name) {
      case 'copilot':
        return { displayName: 'GitHub Copilot', description: t('oauth.copilot_description') };
      case 'anthropic':
        return { displayName: 'Anthropic Claude', description: t('oauth.anthropic_description') };
      case 'antigravity':
        return { displayName: 'Antigravity', description: t('oauth.antigravity_description') };
      default:
        return { displayName: name, description: '' };
    }
  };

  return (
    <Card className="flex h-full flex-col rounded-lg border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b p-4">
        <Button variant="ghost" size="icon" onClick={handleGoBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <CardTitle className="text-lg">
          {t('oauth.title')} <span className="text-sm font-normal text-gray-500">({providers.length})</span>
        </CardTitle>
        <div className="w-9" /> {/* Spacer for alignment */}
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <KeyRound className="h-12 w-12 mb-4 opacity-50" />
            <p>{t('oauth.no_providers')}</p>
            <p className="text-sm">{t('oauth.no_providers_hint')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((provider) => {
              const statusBadge = getStatusBadge(provider.status);
              const providerInfo = getProviderInfo(provider.name);
              const expiry = formatExpiry(provider.expiresAt);

              return (
                <div
                  key={provider.name}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{providerInfo.displayName}</h3>
                      <Badge variant={statusBadge.variant} className={statusBadge.className}>
                        {statusBadge.label}
                      </Badge>
                    </div>
                    {providerInfo.description && (
                      <p className="text-sm text-gray-600 mt-1">{providerInfo.description}</p>
                    )}
                    {expiry && provider.status === 'active' && (
                      <p className="text-xs text-gray-500 mt-1">{expiry}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {provider.status === 'active' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLogoutConfirm(provider.name)}
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        {t('oauth.logout')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleLogin(provider.name)}
                        disabled={isLoggingIn && loginProvider === provider.name}
                      >
                        {isLoggingIn && loginProvider === provider.name ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t('oauth.logging_in')}
                          </>
                        ) : (
                          <>
                            <LogIn className="mr-2 h-4 w-4" />
                            {t('oauth.login')}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Login Dialog */}
      <Dialog open={loginDialogOpen} onOpenChange={(open) => { if (!open) handleLoginDialogClose(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('oauth.login_dialog_title', { provider: loginProvider ? getProviderInfo(loginProvider).displayName : '' })}
            </DialogTitle>
            <DialogDescription>
              {loginResponse?.message}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {loginResponse?.flow === 'device_code' && loginResponse.userCode && (
              <>
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-2">{t('oauth.enter_code')}</p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="text-2xl font-mono font-bold tracking-widest bg-gray-100 px-4 py-2 rounded-lg">
                      {loginResponse.userCode}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyCode(loginResponse.userCode!)}
                    >
                      {codeCopied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                {loginResponse.verificationUri && (
                  <div className="text-center">
                    <a
                      href={loginResponse.verificationUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      {t('oauth.open_verification_page')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </>
            )}
            {loginResponse?.flow === 'authorization_code' && loginResponse.authUrl && (
              <div className="text-center space-y-3">
                <p className="text-sm text-gray-600">{t('oauth.browser_auth_hint')}</p>
                <a
                  href={loginResponse.authUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                >
                  {t('oauth.open_auth_page')}
                  <ExternalLink className="h-3 w-3" />
                </a>
                <p className="text-xs text-gray-400">{t('oauth.waiting_for_callback')}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleLoginDialogClose}>
              {t('oauth.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('oauth.logout_dialog_title')}</DialogTitle>
            <DialogDescription>
              {t('oauth.logout_dialog_description', {
                provider: logoutProvider ? getProviderInfo(logoutProvider).displayName : ''
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogoutDialogOpen(false)}>
              {t('oauth.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleLogout}>
              {t('oauth.logout')}
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
    </Card>
  );
}
