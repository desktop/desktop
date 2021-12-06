/**
 * The oldest officially supported version of GitHub Enterprise.
 * This information is used in user-facing text and shouldn't be
 * considered a hard limit, i.e. older versions of GitHub Enterprise
 * might (and probably do) work just fine but this should be a fairly
 * recent version that we can safely say that we'll work well with.
 *
 * I picked the current minimum (2.8) because it was the version
 * running on our internal GitHub Enterprise instance at the time
 * we implemented Enterprise sign in (desktop/desktop#664)
 */
export const minimumSupportedEnterpriseVersion = '2.8.0'
