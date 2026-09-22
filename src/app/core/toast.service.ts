import { Injectable } from '@angular/core';
import { toast } from 'ngx-sonner';

@Injectable({ providedIn: 'root' })
export class ToastService {
  show(message: string, kind: 'ok' | 'err' = 'ok') {
    if (kind === 'err') {
      toast.error(message);
      return;
    }
    toast.success(message);
  }

  success(message: string) {
    toast.success(message);
  }

  error(message: string) {
    toast.error(message);
  }
}
