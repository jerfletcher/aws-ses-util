
# aws-ses-util

A CLI tool to make it easier to add and manage AWS SES SMTP for sending email from custom domains. Simplifies domain verification, DNS setup, and SMTP credential generation.


## Features

- **Check** a domain's verification status and get required DNS and SMTP settings.
- **Create** a new SES domain identity if it does not exist.
- **List** all verified email identities in a region.


## Installation

1. Clone this repository or copy the files to your project directory.
2. Install dependencies:
   ```sh
   npm install
   ```


## Usage

Run the CLI with Node.js:

```sh
npm start <command> [options]
```

### Commands

#### `check`
Check a domain's verification status and get DNS/SMTP settings.

Options:
- `-d, --domain <domain>`: The domain name to check.
- `-r, --region <region>`: The AWS region for SES (e.g., us-east-1).

If options are not provided, you will be prompted for them.

#### `list`
List all verified email identities in a region.

Options:
- `-r, --region <region>`: The AWS region for SES (e.g., us-east-1).

If not provided, you will be prompted for the region.



## Credentials

Copy `.env.example` to `.env` and enter your AWS credentials:

```
# Example .env file
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-west-2
```
See [AWS documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) for more details.

## Required IAM Policy

To use this tool, your IAM user needs the following minimum policy:

```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": [
				"ses:ListIdentities",
				"ses:GetIdentityVerificationAttributes",
				"ses:VerifyDomainIdentity",
				"ses:ListVerifiedEmailAddresses",
				"ses:ListEmailIdentities",
				"ses:GetEmailIdentity",
				"ses:CreateEmailIdentity",
				"ses:GetIdentityVerificationAttributes"
			],
			"Resource": "*"
		}
	]
}
```

Add this policy to your IAM user or role to allow the tool to manage SES identities.


## SMTP Credentials

To generate SMTP credentials for SES:
1. Go to the AWS Console → IAM → Users.
2. Select or create an IAM user.
3. Go to the 'Security credentials' tab.
4. Under 'Amazon SES SMTP credentials', click 'Create SMTP credentials'.

Store your SMTP username and password securely.

---


For more information, see the source code in `index.js`.
