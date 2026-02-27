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
    <section className="grid" style={{ gap: 16 }}>
      <h1 style={{ margin: 0 }}>Perfil</h1>
      <ProfileForm profile={profile} />
    </section>
  );
}
