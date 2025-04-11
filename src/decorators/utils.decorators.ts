import { ExecutionContext, createParamDecorator } from "@nestjs/common";

export const getRequest = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
      const request: Request = ctx.switchToHttp().getRequest();
      return request;
    },
  );
  