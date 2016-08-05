export default function sanitizedBranchName(name: string): string {
  return name.replace(' ', '-')
}
