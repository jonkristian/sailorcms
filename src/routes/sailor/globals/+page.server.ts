import type { PageServerLoad } from './$types';
import { db, globalTypes } from '$sailor/core/db/index.server';

export const load: PageServerLoad = async () => {
  const globalTypesData = await db.select().from(globalTypes).all();

  return {
    globals: globalTypesData.map((globalType: any) => ({
      key: globalType.slug,
      name: {
        singular: globalType.name_singular,
        plural: globalType.name_plural
      },
      description: globalType.description,
      icon: globalType.icon,
      dataType: globalType.data_type,
      options: JSON.parse(globalType.options || '{}')
    }))
  };
};
