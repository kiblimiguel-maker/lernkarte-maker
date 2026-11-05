/** Keep asynchronous workspace loading tied to the current authenticated user. */
export function createAuthLifecycle({ loadApp, reloadApp, updateAccount, showLoading, showSignedIn, showSignedOut, resetWorkspace, onError }) {
  let userId = null;
  let generation = 0;
  let status = 'idle';
  let appPromise = null;
  let pending = Promise.resolve();

  const ensureApp = () => {
    if (!appPromise) appPromise = Promise.resolve().then(loadApp).catch(error => { appPromise = null; throw error; });
    return appPromise;
  };

  function apply(session, message = '') {
    const nextUserId = session?.user?.id || null;
    if (nextUserId && nextUserId === userId && (status === 'loading' || status === 'ready')) {
      updateAccount(session.user);
      return pending;
    }

    const changedUser = nextUserId !== userId;
    const version = ++generation;
    const needsReload = Boolean(appPromise);
    if (changedUser && userId) resetWorkspace();
    userId = nextUserId;

    if (!userId) {
      status = 'idle';
      showSignedOut(message);
      pending = Promise.resolve();
      return pending;
    }

    status = 'loading';
    updateAccount(session.user);
    showLoading();
    pending = (async () => {
      try {
        await ensureApp();
        if (version !== generation) return;
        if (needsReload) await reloadApp();
        if (version !== generation) return;
        status = 'ready';
        showSignedIn();
      } catch (error) {
        if (version !== generation) return;
        status = 'error';
        onError(error);
      }
    })();
    return pending;
  }

  return { apply };
}
