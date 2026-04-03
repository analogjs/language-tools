import { PageServerLoad } from '@analogjs/router';

export const load = async ({ params }: PageServerLoad) => {
  return { productId: params['productId'] };
};
