import * as fs from 'fs';
import * as path from 'path';

export class Logger {
  private logFilePath: string;

  constructor(chainName: string) {
    const logsDir = path.resolve('./logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    this.logFilePath = path.join(logsDir, `${chainName}.log`);

    // Clear previous log file for fresh run
    if (fs.existsSync(this.logFilePath)) {
      fs.unlinkSync(this.logFilePath);
    }
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  private writeToFile(formattedMessage: string): void {
    fs.appendFileSync(this.logFilePath, formattedMessage + '\n');
  }

  info(message: string): void {
    const formatted = this.formatMessage('INFO', message);
    console.log(formatted);
    this.writeToFile(formatted);
  }

  success(message: string): void {
    const formatted = this.formatMessage('SUCCESS', message);
    console.log(`\x1b[32m${formatted}\x1b[0m`); // Green color
    this.writeToFile(formatted);
  }

  error(message: string, error?: Error): void {
    const formatted = this.formatMessage('ERROR', message);
    console.error(`\x1b[31m${formatted}\x1b[0m`); // Red color
    this.writeToFile(formatted);

    if (error) {
      const errorDetails = this.formatMessage('ERROR', `Stack trace: ${error.stack}`);
      console.error(`\x1b[31m${errorDetails}\x1b[0m`);
      this.writeToFile(errorDetails);
    }
  }

  warn(message: string): void {
    const formatted = this.formatMessage('WARN', message);
    console.warn(`\x1b[33m${formatted}\x1b[0m`); // Yellow color
    this.writeToFile(formatted);
  }

  step(stepNumber: number, message: string): void {
    const formatted = this.formatMessage('STEP', `${stepNumber}: ${message}`);
    console.log(`\x1b[36m${formatted}\x1b[0m`); // Cyan color
    this.writeToFile(formatted);
  }

  deployment(contractName: string, address: string, txHash: string): void {
    const message = `${contractName} deployed at ${address} (tx: ${txHash})`;
    const formatted = this.formatMessage('DEPLOYMENT', message);
    console.log(`\x1b[32m${formatted}\x1b[0m`); // Green color
    this.writeToFile(formatted);
  }

  summary(deployments: { [key: string]: string }): void {
    this.info('='.repeat(60));
    this.success('DEPLOYMENT SUMMARY');
    this.info('='.repeat(60));

    for (const [contractName, address] of Object.entries(deployments)) {
      this.success(`${contractName}: ${address}`);
    }

    this.info('='.repeat(60));
    this.info(`Log file saved to: ${this.logFilePath}`);
  }
}