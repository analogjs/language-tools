import { Component, input } from '@angular/core';

@Component({
  template: `<h1>Product {{ productId() }}</h1>`,
})
export default class ProductDetailPage {
  productId = input.required<string>();
}
