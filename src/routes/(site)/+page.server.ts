export const load = async ({ parent }: { parent: () => Promise<{ siteSettings: any }> }) => {
  const { siteSettings } = await parent();
  return {
    siteSettings
  };
};
