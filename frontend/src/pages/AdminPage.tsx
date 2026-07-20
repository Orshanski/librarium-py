import ConfirmDialog from "../components/confirm-dialog";
import { useAuth } from "../auth";
import PageHeader from "../components/page-header";
import { colors } from "../theme";
import { useAdminUsers } from "../hooks/useAdminUsers";
import { useAdminSmtp } from "../hooks/useAdminSmtp";
import UserCard from "../components/admin/UserCard";
import NewUserForm from "../components/admin/NewUserForm";
import SmtpSection from "../components/admin/SmtpSection";
import { sectionTitleStyle, btnAccentStyle } from "../components/admin/styles";

// ─── Main Page ──────────────────────────────────────
export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const users = useAdminUsers();
  const smtp = useAdminSmtp();
  const loading = users.loading || smtp.loading;

  if (loading || !currentUser) {
    return (
      <><PageHeader title="Настройки" />
        <div style={{ textAlign: "center", padding: 48, color: colors.textDim }}>Загрузка...</div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Настройки" />

      <div style={{ maxWidth: 640 }}>

        {/* ═══ USERS ═══ */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={sectionTitleStyle}>Пользователи</h2>

          {users.users.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              currentUserId={currentUser.id}
              onSaveName={users.saveName}
              onSavePassword={users.savePassword}
              onSaveRole={users.saveRole}
              onDelete={users.requestDelete}
            />
          ))}

          <NewUserForm onCreate={users.createUser} />
        </div>

        {/* ═══ SMTP ═══ */}
        <SmtpSection smtp={smtp} />

        {/* ═══ BACKUP ═══ */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={sectionTitleStyle}>Бэкап</h2>
          <p style={{ fontSize: 13, color: colors.textDim }}>
            Автоматический бэкап в OneDrive ежедневно в 4:00. Настраивается на сервере через rclone + cron.
          </p>
        </div>

        {/* ═══ SAVE ═══ */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 8 }}>
          <button
            style={{ ...btnAccentStyle, opacity: smtp.saving ? 0.5 : 1 }}
            disabled={smtp.saving}
            onClick={smtp.save}
          >
            {smtp.saving ? "Сохранение..." : "Сохранить настройки"}
          </button>
          {smtp.savedToast && (
            <span style={{ fontSize: 13, color: colors.success }}>
              Настройки сохранены
            </span>
          )}
        </div>

      </div>
      {users.deleteUserId != null && (
        <ConfirmDialog
          message="Удалить пользователя?"
          onCancel={users.cancelDelete}
          onConfirm={users.confirmDelete}
        />
      )}
    </>
  );
}
