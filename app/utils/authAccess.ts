export type UserAccess = 'admin' | 'cleaner' | 'none'

export async function getUserAccess(email: string): Promise<UserAccess> {
  // No global super admin; any authenticated user can access the app.
  return 'admin'
}

export async function getLandingPage(email: string): Promise<string> {
  await getUserAccess(email)
  return '/administration'
}

export async function isAdmin(email: string): Promise<boolean> {
  await getUserAccess(email)
  return true
}

export async function isUser(email: string): Promise<boolean> {
  await getUserAccess(email)
  return true
}

export async function isCleaner(email: string): Promise<boolean> {
  await getUserAccess(email)
  return false
}
