import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { getVnpayConfig } from './vnpay-config.js';
import {
  normalizeVnpayQuery,
  verifyVnpaySignature,
} from './vnpay-signature.js';
import { VnpayIpnService } from './vnpay-ipn.service.js';

@Injectable()
export class VnpayReturnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ipn: VnpayIpnService,
  ) {}

  async buildFrontendRedirect(
    rawQuery: Record<string, unknown>,
  ): Promise<string> {
    const config = getVnpayConfig();
    const redirectUrl = new URL('/payment/vnpay-return', config.frontendUrl);
    const params = normalizeVnpayQuery(rawQuery);

    if (
      !params ||
      !verifyVnpaySignature(params, config.hashSecret) ||
      params.vnp_TmnCode !== config.tmnCode ||
      !params.vnp_TxnRef
    ) {
      redirectUrl.searchParams.set('valid', 'false');
      return redirectUrl.toString();
    }

    const payment = await this.prisma.payment.findUnique({
      where: { providerTxnRef: params.vnp_TxnRef },
      select: {
        orderId: true,
        amount: true,
      },
    });

    if (!payment) {
      redirectUrl.searchParams.set('valid', 'false');
      return redirectUrl.toString();
    }

    if (!this.hasValidAmount(params.vnp_Amount, payment.amount)) {
      redirectUrl.searchParams.set('valid', 'false');
      return redirectUrl.toString();
    }

    // The browser return carries the same signed payment result as IPN. Apply
    // it through the one settlement path so a temporarily missed IPN does not
    // leave the customer waiting. A later IPN remains idempotent (RspCode 02).
    const settlement = await this.ipn.handle(rawQuery);
    if (settlement.RspCode !== '00' && settlement.RspCode !== '02') {
      redirectUrl.searchParams.set('valid', 'false');
      return redirectUrl.toString();
    }

    redirectUrl.searchParams.set('valid', 'true');
    redirectUrl.searchParams.set('orderId', String(payment.orderId));
    redirectUrl.searchParams.set('txnRef', params.vnp_TxnRef);

    return redirectUrl.toString();
  }

  private hasValidAmount(
    rawAmount: string | undefined,
    expectedAmount: number,
  ): boolean {
    if (!rawAmount || !/^\d+$/.test(rawAmount)) {
      return false;
    }

    const amount = Number(rawAmount);

    return Number.isSafeInteger(amount) && amount === expectedAmount * 100;
  }
}
