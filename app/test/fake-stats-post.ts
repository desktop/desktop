export const fakePost = (data: Record<string, any>): Promise<Response> =>
  Promise.reject(new Error('Stat requetsts prohibited during testing'))
