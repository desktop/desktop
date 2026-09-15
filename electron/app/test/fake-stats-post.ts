export const fakePost = (data: Record<string, any>): Promise<Response> =>
  Promise.reject(new Error('Stat requests prohibited during testing'))
