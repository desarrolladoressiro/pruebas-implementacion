import { getCurrentUser } from '@/lib/auth';
import { getOrCreateProfile } from '@/lib/profile';
import { ProfileForm } from '@/components/profile-form';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const profile = await getOrCreateProfile(user.id, user.email ?? null);

  return (
    <div className="dashboard-layout single" style={{ paddingBottom: '40px' }}>
      <div className="scrollable-panel" style={{ maxWidth: 800, margin: '0 auto' }}>
        <div className="scrollable-panel-header">
          <span style={{ fontSize: '1.25rem' }}>Perfil Operativo</span>
        </div>
        <div className="scrollable-panel-body">
          <ProfileForm profile={profile} />
        </div>
      </div>
    </div>
  );
}
