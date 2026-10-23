using System.Security.Cryptography;
using System.Text;

namespace Interact3D.Helpers;

public static class PasswordHelper
{
    public static string HashPassword(string password)
    {
        using var sha256 = SHA256.Create();
        var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
        return Convert.ToBase64String(bytes);
    }

    public static bool VerifyPassword(string inputPassword, string storedHash)
    {
        var inputHash = HashPassword(inputPassword);
        return string.Equals(inputHash, storedHash, StringComparison.Ordinal);
    }
}