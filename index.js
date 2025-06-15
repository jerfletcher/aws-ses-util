// ses-manager.js
import dotenv from "dotenv";
dotenv.config();
import {
  SESv2Client,
  GetEmailIdentityCommand,
  CreateEmailIdentityCommand,
  ListEmailIdentitiesCommand,
} from "@aws-sdk/client-sesv2";
import {
  SESClient,
  VerifyDomainIdentityCommand,
  GetIdentityVerificationAttributesCommand
} from "@aws-sdk/client-ses";
import { Command } from "commander";
import prompts from "prompts";
import chalk from "chalk";

const program = new Command();

// --- Helper Functions ---

/**
 * Displays the DNS records required for domain verification and DKIM.
 * @param {object} identity - The email identity object from the AWS SDK.
 * @param {string} domain - The domain name.
 */
function displayDnsRecords(identity, domain) {
  console.log(chalk.yellow("\nDNS Records Required:"));
  console.log(chalk.gray("Add the following records to your domain's DNS settings."));

  // Display DKIM (CNAME) records
  if (identity.DkimAttributes && identity.DkimAttributes.Tokens) {
    console.log(chalk.white.bold("\n--- DKIM Records (for email authentication) ---"));
    identity.DkimAttributes.Tokens.forEach((token) => {
      console.log(chalk.cyan("Type:  ") + "CNAME");
      console.log(chalk.cyan("Name:  ") + `${token}._domainkey.${domain}`);
      console.log(chalk.cyan("Value: ") + `${token}.dkim.amazonses.com`);
      console.log(chalk.magenta("Add this CNAME record to your DNS to enable DKIM for your domain.\n"));
    });
  } else {
     console.log(chalk.white.bold("\n--- DKIM Records ---"));
     console.log(chalk.gray("DKIM records are already configured or not yet generated."));
  }

  // Display _amazonses TXT record from SES API
  if (identity.VerificationAttributes && identity.VerificationAttributes[domain] && identity.VerificationAttributes[domain].VerificationToken) {
    const token = identity.VerificationAttributes[domain].VerificationToken;
    console.log(chalk.white.bold("\n--- _amazonses TXT Record (for domain verification) ---"));
    console.log(chalk.cyan("Type:  ") + "TXT");
    console.log(chalk.cyan("Name:  ") + `_amazonses.${domain}`);
    console.log(chalk.cyan("Value: ") + token);
    console.log(chalk.magenta("Add this TXT record to your DNS to verify your domain with SES.\n"));
  } else if (identity.VerificationToken) {
    // SESv2 returns VerificationToken at the top level
    console.log(chalk.white.bold("\n--- _amazonses TXT Record (for domain verification) ---"));
    console.log(chalk.cyan("Type:  ") + "TXT");
    console.log(chalk.cyan("Name:  ") + `_amazonses.${domain}`);
    console.log(chalk.cyan("Value: ") + identity.VerificationToken);
    console.log(chalk.magenta("Add this TXT record to your DNS to verify your domain with SES.\n"));
  } else {
    console.log(chalk.white.bold("\n--- _amazonses TXT Record (for domain verification) ---"));
    console.log(chalk.gray("No verification token found in SES response. If domain is already verified, this is expected."));
  }

  // DMARC recommended value
  console.log(chalk.white.bold("\n--- _dmarc TXT Record (for DMARC policy) ---"));
  const dmarcValue = 'v=DMARC1; p=none;';
  console.log(chalk.cyan("Type:  ") + "TXT");
  console.log(chalk.cyan("Name:  ") + `_dmarc.${domain}`);
  console.log(chalk.cyan("Value: ") + dmarcValue);
  console.log(chalk.magenta("Add this TXT record to your DNS to set a DMARC policy. Adjust the value as needed for your policy.\n"));
}

/**
 * Displays the SMTP settings for the given AWS region.
 * @param {string} region - The AWS region.
 */
function displaySmtpSettings(region) {
  console.log(chalk.yellow("\nSMTP Client Configuration:"));
  console.log(chalk.gray("Use these settings in your email sending application."));
  console.log(chalk.white.bold("\n--- SMTP Server Settings ---"));
  console.log(chalk.cyan("Endpoint: ") + `email-smtp.${region}.amazonaws.com`);
  console.log(chalk.cyan("Port:     ") + "587 (TLS), 465 (SSL), or 2587");

  console.log(chalk.white.bold("\n--- SMTP Credentials ---"));
  console.log("To get your SMTP username and password:");
  console.log("1. Go to the AWS Console -> IAM -> Users.");
  console.log("2. Select or create an IAM user.");
  console.log("3. Go to the 'Security credentials' tab.");
  console.log("4. Under 'Amazon SES SMTP credentials', click 'Create SMTP credentials'.");
  console.log(chalk.gray("This will generate a unique SMTP username and password. Store them securely.\n"));
}

// --- Main Program Logic ---

program
  .name("npm start")
  .description("A CLI tool to manage AWS SES domain identities.");

program
  .command("check")
  .description("Check a domain's verification status and get DNS/SMTP settings.")
  .option("-d, --domain <domain>", "The domain name to check.")
  .option("-r, --region <region>", "The AWS region for SES.")
  .action(async (options) => {
    let responses = options;
    const envRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

    // Prompt for region if missing
    if (!options.region) {
      const regionPrompt = await prompts({
        type: 'text',
        name: 'region',
        message: 'Enter the AWS region (e.g., us-east-1):',
        initial: options.region || envRegion || 'us-east-1',
      });
      responses = { ...options, ...regionPrompt };
    }

    // Initialize sesClient after region is set
    const sesClient = new SESv2Client({ region: responses.region });

    // List all domains and let user select or choose new
    const listCommand = new ListEmailIdentitiesCommand({});
    let EmailIdentities = [];
    try {
      const listResp = await sesClient.send(listCommand);
      EmailIdentities = (listResp.EmailIdentities || []).filter(e => e.IdentityType === 'DOMAIN');
    } catch (e) {
      console.log(chalk.red('Could not fetch domain list:'), e);
    }

    let domainChoices = EmailIdentities.map(e => ({ title: e.IdentityName, value: e.IdentityName }));
    domainChoices.push({ title: 'Add new domain', value: '__new__' });

    let domain = options.domain;
    if (!domain) {
      const domainPrompt = await prompts({
        type: 'select',
        name: 'domain',
        message: 'Select a domain or add a new one:',
        choices: domainChoices,
      });
      domain = domainPrompt.domain;
    }

    if (!domain) {
      console.log(chalk.red('Domain is required. Exiting.'));
      return;
    }

    if (domain === '__new__') {
      const newDomainPrompt = await prompts({
        type: 'text',
        name: 'domain',
        message: 'Enter the new domain name:',
      });
      domain = newDomainPrompt.domain;
      if (!domain) {
        console.log(chalk.red('Domain is required. Exiting.'));
        return;
      }
    }

    responses = { ...responses, domain };

    try {
      // Always fetch the latest identity info to get VerificationToken
      console.log(chalk.blue(`\nChecking identity for ${chalk.bold(responses.domain)} in ${responses.region}...`));
      // Use SESv2 for DKIM and status, SES classic for verification token
      const getIdentityCommand = new GetEmailIdentityCommand({ EmailIdentity: responses.domain });
      const apiResponse = await sesClient.send(getIdentityCommand);
      // Now get verification token using SES classic
      const sesClassicClient = new SESClient({ region: responses.region });
      const getTokenCommand = new GetIdentityVerificationAttributesCommand({ Identities: [responses.domain] });
      const tokenResp = await sesClassicClient.send(getTokenCommand);
      let verificationToken = undefined;
      if (tokenResp.VerificationAttributes && tokenResp.VerificationAttributes[responses.domain]) {
        verificationToken = tokenResp.VerificationAttributes[responses.domain].VerificationToken;
      }
      // Attach token to identity for display
      const identity = { ...apiResponse, VerificationToken: verificationToken };
      console.log("\nRaw API Response:");
      console.dir(identity, { depth: null, colors: false });
      if (identity) {
        console.log(chalk.green.bold("\nDomain Identity Found!"));
        console.log(`${chalk.bold("Status:")} ${identity.VerifiedForSendingStatus ? chalk.green("VERIFIED") : chalk.yellow("PENDING")}`);
        console.log(`${chalk.bold("DKIM Verified:")} ${identity.DkimAttributes && identity.DkimAttributes.Status === 'SUCCESS' ? chalk.green("VERIFIED") : chalk.yellow(identity.DkimAttributes ? identity.DkimAttributes.Status : 'N/A')}`);
        displayDnsRecords(identity, responses.domain);
        displaySmtpSettings(responses.region);
        // --- Save DNS records to file ---
        let dnsLines = [];
        // _amazonses TXT
        if (identity.VerificationToken) {
          dnsLines.push(`_amazonses.${responses.domain}.\t1\tIN\tTXT\t"${identity.VerificationToken}"`);
        }
        // DKIM records
        if (identity.DkimAttributes && identity.DkimAttributes.Tokens) {
          identity.DkimAttributes.Tokens.forEach(token => {
            dnsLines.push(`${token}._domainkey.${responses.domain}.\t1\tIN\tCNAME\t${token}.dkim.amazonses.com.`);
          });
        }
        // DMARC (example, user should edit as needed)
        dnsLines.push(`_dmarc.${responses.domain}.\t1\tIN\tTXT\t"v=DMARC1; p=none;"`);
        // Save to file
        const fs = await import('fs');
        const path = `${responses.domain}.dns.txt`;
        fs.writeFileSync(path, dnsLines.join("\n") + "\n");
        console.log(chalk.green(`\nDNS records saved to ${path}`));
      } else {
        console.log(chalk.red("No identity details found in API response."));
      }
    } catch (error) {
      if (error.name === "NotFoundException") {
        console.log(chalk.yellow(`\nIdentity for "${responses.domain}" not found.`));
        const { shouldCreate } = await prompts({
            type: 'confirm',
            name: 'shouldCreate',
            message: 'Would you like to create it now?',
            initial: true
        });

        if (shouldCreate) {
            console.log(chalk.blue(`\nCreating new identity for ${chalk.bold(responses.domain)}...`));
            const createCommand = new CreateEmailIdentityCommand({ EmailIdentity: responses.domain });
            const { DkimAttributes } = await sesClient.send(createCommand);
            console.log(chalk.green.bold("\nIdentity creation process initiated!"));
            console.log("It can take up to 72 hours for DNS changes to propagate and verification to complete.");
            
            displayDnsRecords({ DkimAttributes }, responses.domain);
            displaySmtpSettings(responses.region);
        }

      } else {
        console.error(chalk.red("An unexpected error occurred:"), error);
      }
    }
  });

program
  .command("list")
  .description("List all verified email identities in a region.")
  .option("-r, --region <region>", "The AWS region for SES.")
  .action(async (options) => {
    let responses = options;
    const envRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    if(!options.region) {
        responses = await prompts({
            type: 'text',
            name: 'region',
            message: 'Enter the AWS region to list identities from:',
            initial: options.region || envRegion || 'us-east-1'
        });
    }

    // Use sesClient from outer scope if available
    const sesClient = new SESv2Client({ region: responses.region });
    console.log(chalk.blue(`\nFetching identities for region ${chalk.bold(responses.region)}...`));
    
    try {
        const command = new ListEmailIdentitiesCommand({});
        const { EmailIdentities } = await sesClient.send(command);

        if (EmailIdentities.length === 0) {
            console.log(chalk.yellow("No SES identities found in this region."));
            return;
        }

        console.log(chalk.yellow("\n--- SES Identities ---"));
        EmailIdentities.forEach(identity => {
            console.log(
                `${chalk.cyan(identity.IdentityName)} - Type: ${chalk.bold(identity.IdentityType)}`
            );
        });
        console.log("\n");

    } catch(error) {
        console.error(chalk.red("An error occurred while fetching identities:"), error);
    }
  });



process.on('SIGINT', () => {
  console.log('\nInterrupted. Exiting gracefully.');
  process.exit(0);
});

program.parse(process.argv);

if (process.argv.length < 3) {
    program.help();
}
