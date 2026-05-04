"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, User, Mail, Lock, Camera, Loader2, Check, Shield, Eye, EyeOff,
} from "lucide-react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { Breadcrumb } from "@/components/ui/breadcrumb";

// Logo local removido — usar `<Logo />` compartilhado.

export default function PerfilPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  // Erros inline da seção de senha — exibidos abaixo dos campos.
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdConfirmError, setPwdConfirmError] = useState<string | null>(null);

  // Avatar upload
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState(false);

  // Load user data once — useEffect evita setState durante render
  useEffect(() => {
    if (user && !profileLoaded) {
      setFullName(user.user_metadata?.full_name || "");
      setAvatarUrl(user.user_metadata?.avatar_url || null);
      setProfileLoaded(true);
    }
  }, [user, profileLoaded]);

  const handleSaveProfile = async () => {
    if (!fullName.trim()) { toast.error("Digite seu nome"); return; }
    setSavingProfile(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
      });
      if (error) throw error;
      toast.success("Perfil atualizado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    let hasError = false;
    if (!newPassword || newPassword.length < 6) {
      setPwdError("A nova senha deve ter no mínimo 6 caracteres");
      hasError = true;
    } else {
      setPwdError(null);
    }
    if (newPassword !== confirmPassword) {
      setPwdConfirmError("As senhas não coincidem");
      hasError = true;
    } else {
      setPwdConfirmError(null);
    }
    if (hasError) return;

    setSavingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
      setPwdError(null);
      setPwdConfirmError(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar senha");
    } finally {
      setSavingPassword(false);
    }
  };

  const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

  function validateAvatarFile(file: File): string | null {
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) return "Formato invalido. Use JPG, PNG ou WebP.";
    if (file.size > MAX_AVATAR_BYTES) return "Arquivo muito grande. Maximo 2MB.";
    return null;
  }

  function mapStorageError(error: Error): string {
    const msg = error.message.toLowerCase();
    if (msg.includes("mime type")) return "Formato de arquivo nao suportado.";
    if (msg.includes("size") || msg.includes("too large")) return "Arquivo muito grande. Maximo 2MB.";
    if (msg.includes("unauthorized") || msg.includes("policy")) return "Sem permissao para fazer upload.";
    return "Erro ao salvar foto. Tente novamente.";
  }

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";

    const validationError = validateAvatarFile(file);
    if (validationError) {
      setAvatarError(validationError);
      return;
    }

    // Clean previous preview
    if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);

    setAvatarError(null);
    setAvatarSuccess(false);
    setPendingAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleAvatarSave = async () => {
    if (!pendingAvatarFile || !user) return;
    setAvatarLoading(true);
    setAvatarError(null);
    try {
      const supabase = createClient();
      const ext = pendingAvatarFile.name.split(".").pop() || "jpg";
      const path = `${user.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, pendingAvatarFile, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: urlData.publicUrl },
      });
      if (updateError) throw updateError;

      setAvatarUrl(urlData.publicUrl + "?t=" + Date.now());
      handleAvatarCancel();
      setAvatarSuccess(true);
      setTimeout(() => setAvatarSuccess(false), 3000);
    } catch (err) {
      setAvatarError(mapStorageError(err instanceof Error ? err : new Error(String(err))));
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleAvatarCancel = () => {
    if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    setPendingAvatarFile(null);
    setAvatarError(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cf-bg">
        <Loader2 size={24} className="animate-spin text-cf-navy" />
      </div>
    );
  }

  // Redirect via useEffect (router.push em render é anti-padrão)
  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-cf-bg flex flex-col">
      {/* Navbar */}
      <header className="bg-white border-b border-cf-border sticky top-0 z-50" style={{ boxShadow: "0 1px 3px rgba(32,59,136,0.06)" }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" style={{ minHeight: "auto" }}><Logo /></Link>
          <span className="text-xs font-semibold text-cf-navy/60 uppercase tracking-wider">Perfil</span>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-5 sm:px-8 py-8 space-y-6">
        <Breadcrumb items={[{ label: "Meu Perfil", current: true }]} />

        <h1 className="text-2xl font-bold text-cf-text-1">Meu Perfil</h1>

        {/* ── Avatar + Dados básicos ── */}
        <div className="card p-6">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0 space-y-2">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-cf-navy/10 flex items-center justify-center overflow-hidden border-2 border-cf-border">
                  {(avatarPreview || avatarUrl) ? (
                    <Image src={avatarPreview || avatarUrl!} alt="Avatar" width={80} height={80} className="w-full h-full object-cover" unoptimized />
                  ) : (
                    <User size={32} className="text-cf-navy/40" />
                  )}
                </div>
                {!pendingAvatarFile && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-cf-navy text-white flex items-center justify-center shadow-md hover:bg-cf-navy-dark transition-colors"
                    style={{ minHeight: "auto" }}
                  >
                    <Camera size={13} />
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarSelect} className="hidden" />
              </div>

              {/* Preview actions */}
              {pendingAvatarFile && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleAvatarSave}
                    disabled={avatarLoading}
                    className="flex items-center gap-1 text-[11px] font-semibold text-white bg-cf-green hover:bg-green-600 rounded-lg px-2.5 py-1.5 transition-colors"
                    style={{ minHeight: "auto" }}
                  >
                    {avatarLoading ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Salvar
                  </button>
                  <button
                    onClick={handleAvatarCancel}
                    disabled={avatarLoading}
                    className="text-[11px] font-semibold text-cf-text-3 hover:text-cf-danger px-2 py-1.5 transition-colors"
                    style={{ minHeight: "auto" }}
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Feedback */}
              {avatarLoading && <p className="text-[11px] text-cf-navy font-medium">Salvando foto...</p>}
              {avatarError && <p className="text-[11px] text-red-500 font-medium">{avatarError}</p>}
              {avatarSuccess && <p className="text-[11px] text-cf-green font-medium">Foto atualizada!</p>}
            </div>

            {/* Info */}
            <div className="flex-1 space-y-4">
              <div>
                <label className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest block mb-1.5">Nome completo</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-cf-text-4" />
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                    placeholder="Seu nome" className="input-field pl-9 h-11" />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest block mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-cf-text-4" />
                  <input type="email" value={user.email || ""} disabled className="input-field pl-9 h-11 opacity-60" />
                </div>
                <p className="text-[11px] text-cf-text-4 mt-1">O e-mail não pode ser alterado</p>
              </div>

              <button onClick={handleSaveProfile} disabled={savingProfile} className="btn-primary h-10 text-sm">
                {savingProfile ? <Loader2 size={15} className="animate-spin" /> : <><Check size={15} /> Salvar alterações</>}
              </button>
            </div>
          </div>
        </div>

        {/* ── Alterar Senha ── */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-cf-warning/10 flex items-center justify-center">
              <Lock size={16} className="text-cf-warning" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-cf-text-1">Alterar Senha</h2>
              <p className="text-[11px] text-cf-text-3">Mínimo 6 caracteres</p>
            </div>
            <button onClick={() => setShowPasswords(p => !p)} className="ml-auto text-cf-text-4 hover:text-cf-navy transition-colors" style={{ minHeight: "auto" }}>
              {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest block mb-1.5">Nova senha</label>
              <input
                type={showPasswords ? "text" : "password"}
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); if (pwdError) setPwdError(null); }}
                onBlur={() => {
                  if (newPassword && newPassword.length < 6) setPwdError("A nova senha deve ter no mínimo 6 caracteres");
                }}
                placeholder="Digite a nova senha"
                className={`input-field h-11 ${pwdError ? "border-red-400 focus:ring-red-200 focus:border-red-400" : ""}`}
                aria-invalid={!!pwdError}
                aria-describedby={pwdError ? "pwd-error" : undefined}
              />
              {pwdError && <p id="pwd-error" className="text-xs text-red-600 mt-1">{pwdError}</p>}
              {!pwdError && newPassword && newPassword.length >= 6 && (
                <p className="text-xs text-cf-text-3 mt-1">
                  {newPassword.length < 8 ? "Senha aceitável" : newPassword.length < 12 ? "Boa senha" : "Senha forte"}
                </p>
              )}
            </div>
            <div>
              <label className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest block mb-1.5">Confirmar nova senha</label>
              <input
                type={showPasswords ? "text" : "password"}
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); if (pwdConfirmError) setPwdConfirmError(null); }}
                onBlur={() => {
                  if (confirmPassword && confirmPassword !== newPassword) setPwdConfirmError("As senhas não coincidem");
                }}
                placeholder="Repita a nova senha"
                className={`input-field h-11 ${pwdConfirmError ? "border-red-400 focus:ring-red-200 focus:border-red-400" : ""}`}
                aria-invalid={!!pwdConfirmError}
                aria-describedby={pwdConfirmError ? "pwd-confirm-error" : undefined}
              />
              {pwdConfirmError && <p id="pwd-confirm-error" className="text-xs text-red-600 mt-1">{pwdConfirmError}</p>}
            </div>
            <button onClick={handleChangePassword} disabled={savingPassword} className="btn-green h-10 text-sm">
              {savingPassword ? <Loader2 size={15} className="animate-spin" /> : <><Lock size={15} /> Alterar senha</>}
            </button>
          </div>
        </div>

        {/* ── Informações da conta ── */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-cf-navy/10 flex items-center justify-center">
              <Shield size={16} className="text-cf-navy" />
            </div>
            <h2 className="text-sm font-bold text-cf-text-1">Informações da Conta</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-cf-border">
              <span className="text-cf-text-3">ID do usuário</span>
              <span className="text-cf-text-1 font-mono text-xs">{user.id.substring(0, 16)}...</span>
            </div>
            <div className="flex justify-between py-2 border-b border-cf-border">
              <span className="text-cf-text-3">Conta criada em</span>
              <span className="text-cf-text-1">{new Date(user.created_at).toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-cf-text-3">Último login</span>
              <span className="text-cf-text-1">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("pt-BR") : "—"}</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-cf-dark mt-8">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-6 flex items-center justify-between">
          <Logo light />
          <p className="text-xs text-white/30">&copy; {new Date().getFullYear()} Capital Finanças</p>
        </div>
      </footer>
    </div>
  );
}
