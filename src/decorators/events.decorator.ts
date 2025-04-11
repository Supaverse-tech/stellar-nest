export function EmitEvent(event: string) {
  return function (_: unknown, __: unknown, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      if (this.options && this.options.emitEvents) {
        this.eventEmitter.emit(event, result);
      }
      return result;
    };

    return descriptor;
  };
}
