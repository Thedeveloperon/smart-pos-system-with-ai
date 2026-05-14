using System.Security.Cryptography;
using System.Text;

namespace SmartPos.Backend.Security;

public static class TotpMfa
{
    public static bool VerifyCode(
        string secret,
        string code,
        DateTimeOffset now,
        int stepSeconds,
        int allowedSkewWindows)
    {
        if (string.IsNullOrWhiteSpace(secret) || string.IsNullOrWhiteSpace(code))
        {
            return false;
        }

        if (!int.TryParse(code.Trim(), out _))
        {
            return false;
        }

        var normalizedCode = code.Trim();
        var normalizedSecret = secret.Trim();
        var step = Math.Max(15, stepSeconds);
        var skew = Math.Max(0, allowedSkewWindows);
        var counter = now.ToUnixTimeSeconds() / step;

        for (var i = -skew; i <= skew; i++)
        {
            var candidate = GenerateCode(normalizedSecret, counter + i);
            if (CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(candidate),
                    Encoding.UTF8.GetBytes(normalizedCode)))
            {
                return true;
            }
        }

        return false;
    }

    public static string GenerateCode(string secret, long counter)
    {
        var counterBytes = BitConverter.GetBytes(counter);
        if (BitConverter.IsLittleEndian)
        {
            Array.Reverse(counterBytes);
        }

        using var hmac = new HMACSHA1(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(counterBytes);
        var offset = hash[^1] & 0x0F;
        var binaryCode = ((hash[offset] & 0x7F) << 24)
                         | ((hash[offset + 1] & 0xFF) << 16)
                         | ((hash[offset + 2] & 0xFF) << 8)
                         | (hash[offset + 3] & 0xFF);

        return (binaryCode % 1_000_000).ToString("D6");
    }
}
