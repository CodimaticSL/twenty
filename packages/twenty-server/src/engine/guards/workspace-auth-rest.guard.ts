import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';

import { type Observable } from 'rxjs';

/**
 * WorkspaceAuthGuard for REST endpoints
 * Validates that workspace is attached to the request
 */
@Injectable()
export class WorkspaceAuthRestGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();

    return request.workspace !== undefined;
  }
}