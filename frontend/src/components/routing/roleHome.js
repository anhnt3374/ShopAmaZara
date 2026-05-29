// Home route for a user based on their role. Sellers live under /store; everyone
// else (buyers) lands on the storefront root.
export function roleHome(user) {
  return user?.role === 'seller' ? '/store' : '/';
}
