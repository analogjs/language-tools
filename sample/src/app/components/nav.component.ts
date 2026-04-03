import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-nav',
  templateUrl: './nav.component.html',
})
export class NavComponent {
  constructor(private router: Router) {}

  goToProduct(id: string) {
    // Test: type inside navigate string to trigger route completions
    this.router.navigate(['/products', id]);
  }

  goToAbout() {
    // Test: route completions in navigateByUrl
    this.router.navigateByUrl('/about');
  }
}
