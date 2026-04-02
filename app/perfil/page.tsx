"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, User, Mail, Lock, Camera, Loader2, Check, Shield, Eye, EyeOff,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

function Logo({ light = false }: { light?: boolean }) {
  const c = light ? "#ffffff" : "#203b88";
  return (
    <svg width="160" height="22" viewBox="0 0 451 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Capital Finanças">
      <circle cx="31" cy="27" r="22" stroke={c} strokeWidth="4.5" fill="none" />
      <circle cx="31" cy="49" r="4.5" fill={c} />
      <text x="66" y="46" fontFamily="'Open Sans', Arial, sans-serif" fontWeight="700" fontSize="38" letterSpacing="-0.3">
        <tspan fill={c}>capital</tspan><tspan fill="#73b815">finanças</tspan>
      </text>
    </svg>
  );
}

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

  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Load user data once
  if (user && !profileLoaded) {
    setFullName(user.user_metadata?.full_name || "");
    setAvatarUrl(user.user_metadata?.avatar_url || null);
    setProfileLoaded(true);
  }

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
    if (!newPassword || newPassword.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    setSavingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar senha");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 2MB"); return; }

    setUploadingAvatar(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `avatars/${user.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: urlData.publicUrl },
      });
      if (updateError) throw updateError;

      setAvatarUrl(urlData.publicUrl + "?t=" + Date.now());
      toast.success("Foto atualizada!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar foto");
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cf-bg">
        <Loader2 size={24} className="animate-spin text-cf-navy" />
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

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
        {/* Back */}
        <Link href="/" className="flex items-center gap-1.5 text-xs font-semibold text-cf-text-3 hover:text-cf-navy transition-colors" style={{ minHeight: "auto" }}>
          <ArrowLeft size={13} /> Voltar ao painel
        </Link>

        <h1 className="text-2xl font-bold text-cf-text-1">Meu Perfil</h1>

        {/* ── Avatar + Dados básicos ── */}
        <div className="card p-6">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-cf-navy/10 flex items-center justify-center overflow-hidden border-2 border-cf-border">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Avatar" width={96} height={96} className="w-full h-full object-cover" unoptimized />
                ) : (
                  <User size={32} className="text-cf-navy/40" />
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-cf-navy text-white flex items-center justify-center shadow-md hover:bg-cf-navy-dark transition-colors"
                style={{ minHeight: "auto" }}
              >
                {uploadingAvatar ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
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
              <p className="text-[11px] text-cf-text-3">Mínimo 8 caracteres (maiúscula + número)</p>
            </div>
            <button onClick={() => setShowPasswords(p => !p)} className="ml-auto text-cf-text-4 hover:text-cf-navy transition-colors" style={{ minHeight: "auto" }}>
              {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest block mb-1.5">Nova senha</label>
              <input type={showPasswords ? "text" : "password"} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha" className="input-field h-11" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-cf-text-3 uppercase tracking-widest block mb-1.5">Confirmar nova senha</label>
              <input type={showPasswords ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha" className="input-field h-11" />
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
