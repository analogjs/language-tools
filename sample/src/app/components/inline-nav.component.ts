import { Component } from '@angular/core';

@Component({
  selector: 'app-inline-nav',
  template: `
    <nav>
      <!-- Test: route completions inside inline template -->
      <a routerLink="/">Home</a>
      <a routerLink="/about">About</a>
      <a routerLink="/products">Products</a>
    </nav>
  `,
})
export class InlineNavComponent {}
